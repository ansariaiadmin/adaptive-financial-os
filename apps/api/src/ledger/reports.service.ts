import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

/**
 * Reports Service — v3.2.2 — تاریکی روشن شد — همینا رو برو
 * 
 * BEFORE: فقط listBalances — ساده — برای حسابدار کافی نیست
 * AFTER: trial balance + balance sheet + income statement + ledger export — حسابدار واقعی می‌تونه کار کنه — سقف
 */

export interface TrialBalanceRow {
  account_code: string;
  account_name: string;
  currency: string;
  debit_total: string;
  credit_total: string;
  net_balance: string;
  debit_or_credit: 'debit' | 'credit';
}

export interface BalanceSheet {
  tenantId: string;
  asOf: string;
  assets: TrialBalanceRow[];
  liabilities: TrialBalanceRow[];
  equity: TrialBalanceRow[];
  totalAssets: string;
  totalLiabilities: string;
  totalEquity: string;
  balanced: boolean;
}

export interface IncomeStatement {
  tenantId: string;
  from: string;
  to: string;
  revenue: TrialBalanceRow[];
  expenses: TrialBalanceRow[];
  totalRevenue: string;
  totalExpenses: string;
  netIncome: string;
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private readonly db: DatabaseService) {}

  /** Trial Balance — تراز آزمایشی — همه حساب‌ها با مانده بدهکار/بستانکار */
  async trialBalance(tenantId: string): Promise<{ rows: TrialBalanceRow[]; totalDebit: string; totalCredit: string; balanced: boolean }> {
    const client = await this.db.getClient();
    try {
      await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
      
      const res = await client.query(
        `SELECT 
           a.code as account_code,
           a.name as account_name,
           COALESCE(ab.currency, a.currency) as currency,
           COALESCE(ab.debit_total, 0) as debit_total,
           COALESCE(ab.credit_total, 0) as credit_total,
           COALESCE(ab.net_balance, 0) as net_balance,
           CASE WHEN COALESCE(ab.net_balance, 0) >= 0 THEN 'debit' ELSE 'credit' END as debit_or_credit
         FROM accounts a
         LEFT JOIN account_balances ab ON ab.account_id = a.id AND ab.tenant_id = $1
         WHERE a.tenant_id = $1
         ORDER BY a.code ASC`,
        [tenantId]
      );

      const rows = res.rows as TrialBalanceRow[];
      
      let totalDebit = 0n;
      let totalCredit = 0n;
      for (const row of rows) {
        const net = BigInt(row.net_balance);
        if (net >= 0) totalDebit += net;
        else totalCredit += -net;
      }

      return {
        rows,
        totalDebit: totalDebit.toString(),
        totalCredit: totalCredit.toString(),
        balanced: totalDebit === totalCredit,
      };
    } finally {
      client.release();
    }
  }

  /** Balance Sheet — ترازنامه — دارایی = بدهی + سرمایه */
  async balanceSheet(tenantId: string): Promise<BalanceSheet> {
    const tb = await this.trialBalance(tenantId);
    
    const assets = tb.rows.filter(r => r.account_code.startsWith('1'));
    const liabilities = tb.rows.filter(r => r.account_code.startsWith('2'));
    const equity = tb.rows.filter(r => r.account_code.startsWith('3'));

    const sum = (rows: TrialBalanceRow[]) => rows.reduce((acc, r) => acc + BigInt(r.net_balance), 0n).toString();

    const totalAssets = sum(assets);
    const totalLiabilities = sum(liabilities);
    const totalEquity = sum(equity);

    // Assets = Liabilities + Equity should balance
    const balanced = BigInt(totalAssets) === BigInt(totalLiabilities) + BigInt(totalEquity);

    return {
      tenantId,
      asOf: new Date().toISOString(),
      assets,
      liabilities,
      equity,
      totalAssets,
      totalLiabilities,
      totalEquity,
      balanced,
    };
  }

  /** Income Statement — صورت سود و زیان */
  async incomeStatement(tenantId: string, from?: string, to?: string): Promise<IncomeStatement> {
    const client = await this.db.getClient();
    try {
      await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);

      let dateFilter = '';
      const params: any[] = [tenantId];
      if (from && to) {
        dateFilter = 'AND je.occurred_at BETWEEN $2 AND $3';
        params.push(from, to);
      } else if (from) {
        dateFilter = 'AND je.occurred_at >= $2';
        params.push(from);
      }

      const res = await client.query(
        `SELECT 
           a.code as account_code,
           a.name as account_name,
           a.currency,
           COALESCE(SUM(CASE WHEN jl.direction = 'debit' THEN jl.amount ELSE 0 END), 0) as debit_total,
           COALESCE(SUM(CASE WHEN jl.direction = 'credit' THEN jl.amount ELSE 0 END), 0) as credit_total,
           COALESCE(SUM(CASE WHEN jl.direction = 'debit' THEN jl.amount ELSE -jl.amount END), 0) as net_balance
         FROM accounts a
         LEFT JOIN journal_lines jl ON jl.account_id = a.id AND jl.tenant_id = $1
         LEFT JOIN journal_entries je ON je.id = jl.entry_id AND je.tenant_id = $1
         WHERE a.tenant_id = $1 AND (a.code LIKE '4%' OR a.code LIKE '5%') ${dateFilter}
         GROUP BY a.code, a.name, a.currency
         ORDER BY a.code ASC`,
        params
      );

      const rows = res.rows as TrialBalanceRow[];
      const revenue = rows.filter(r => r.account_code.startsWith('4'));
      const expenses = rows.filter(r => r.account_code.startsWith('5'));

      const sumCredit = (rows: TrialBalanceRow[]) => rows.reduce((acc, r) => acc + BigInt(r.credit_total), 0n).toString();
      const sumDebit = (rows: TrialBalanceRow[]) => rows.reduce((acc, r) => acc + BigInt(r.debit_total), 0n).toString();

      const totalRevenue = sumCredit(revenue);
      const totalExpenses = sumDebit(expenses);
      const netIncome = (BigInt(totalRevenue) - BigInt(totalExpenses)).toString();

      return {
        tenantId,
        from: from || new Date(new Date().getFullYear(), 0, 1).toISOString(),
        to: to || new Date().toISOString(),
        revenue,
        expenses,
        totalRevenue,
        totalExpenses,
        netIncome,
      };
    } finally {
      client.release();
    }
  }

  /** Ledger Export — دفتر کل — برای حسابرس */
  async ledgerExport(tenantId: string, accountCode?: string, from?: string, to?: string): Promise<any[]> {
    const client = await this.db.getClient();
    try {
      await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);

      let filters = 'WHERE jl.tenant_id = $1';
      const params: any[] = [tenantId];
      let paramIdx = 2;

      if (accountCode) {
        filters += ` AND a.code = $${paramIdx}`;
        params.push(accountCode);
        paramIdx++;
      }
      if (from) {
        filters += ` AND je.occurred_at >= $${paramIdx}`;
        params.push(from);
        paramIdx++;
      }
      if (to) {
        filters += ` AND je.occurred_at <= $${paramIdx}`;
        params.push(to);
        paramIdx++;
      }

      const res = await client.query(
        `SELECT 
           je.id as entry_id,
           je.description,
           je.occurred_at,
           je.created_at,
           a.code as account_code,
           a.name as account_name,
           jl.amount,
           jl.direction,
           jl.currency
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl.entry_id
         JOIN accounts a ON a.id = jl.account_id
         ${filters}
         ORDER BY je.occurred_at ASC, je.created_at ASC
         LIMIT 1000`,
        params
      );

      return res.rows;
    } finally {
      client.release();
    }
  }

  /** Account Hierarchy — درخت حساب‌ها */
  async accountHierarchy(tenantId: string): Promise<any> {
    const tb = await this.trialBalance(tenantId);
    
    const hierarchy: any = {
      assets: { code: '1', name: 'دارایی‌ها', children: [] },
      liabilities: { code: '2', name: 'بدهی‌ها', children: [] },
      equity: { code: '3', name: 'سرمایه', children: [] },
      revenue: { code: '4', name: 'درآمد', children: [] },
      expenses: { code: '5', name: 'هزینه', children: [] },
    };

    for (const row of tb.rows) {
      const firstDigit = row.account_code[0];
      if (firstDigit === '1') hierarchy.assets.children.push(row);
      else if (firstDigit === '2') hierarchy.liabilities.children.push(row);
      else if (firstDigit === '3') hierarchy.equity.children.push(row);
      else if (firstDigit === '4') hierarchy.revenue.children.push(row);
      else if (firstDigit === '5') hierarchy.expenses.children.push(row);
    }

    return hierarchy;
  }
}
