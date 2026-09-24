import { IsArray, IsIn, IsISO8601, IsOptional, IsString, Matches, MaxLength, ArrayMinSize, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class JournalLineDto {
  @IsString()
  @MaxLength(64)
  accountCode!: string;

  /** Positive integer amount as a decimal string, e.g. "15025" (minor units). */
  @IsString()
  @Matches(/^\d+$/, { message: 'amount must be a positive integer string' })
  amount!: string;

  @IsIn(['debit', 'credit'])
  direction!: 'debit' | 'credit';

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;
}

export class PostEntryDto {
  @IsString()
  @MaxLength(128)
  idempotencyKey!: string;

  @IsString()
  @MaxLength(64)
  tenantId!: string;

  @IsString()
  @MaxLength(512)
  description!: string;

  @IsOptional()
  @IsISO8601()
  occurredAt?: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines!: JournalLineDto[];
}
