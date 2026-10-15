import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';
import type {
  ForgotPasswordRequest,
  LoginRequest,
  RegisterRequest,
  ResetPasswordRequest,
  VerifyEmailRequest,
} from '@studywidbuddy/shared';

const trimLower = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// Length limits: 10 chars minimum (NIST 800-63B allows 8; we ask a little more), 128 max to bound hashing cost.
const PASSWORD_RULE = { min: 10, max: 128 };

export class RegisterDto implements RegisterRequest {
  @ApiProperty({ example: 'manoj@example.com' })
  @Transform(trimLower)
  @IsEmail({}, { message: 'Enter a full email address, like name@uni.edu' })
  @MaxLength(254)
  email: string;

  @ApiProperty({ minLength: PASSWORD_RULE.min })
  @IsString()
  @Length(PASSWORD_RULE.min, PASSWORD_RULE.max, { message: `Use at least ${PASSWORD_RULE.min} characters.` })
  password: string;

  @ApiProperty({ example: 'Manoj Kumar' })
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  displayName: string;

  @ApiProperty({ example: 'manoj.dev', description: '3–30 characters: letters, numbers, dots, dashes, underscores' })
  @Transform(trimLower)
  @Matches(/^[a-z0-9](?:[a-z0-9._-]{1,28})[a-z0-9]$/, {
    message: 'Use 3–30 letters, numbers, dots, dashes or underscores.',
  })
  username: string;
}

export class LoginDto implements LoginRequest {
  @ApiProperty()
  @Transform(trimLower)
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(PASSWORD_RULE.max)
  password: string;
}

export class ForgotPasswordDto implements ForgotPasswordRequest {
  @ApiProperty()
  @Transform(trimLower)
  @IsEmail()
  email: string;
}

export class ResetPasswordDto implements ResetPasswordRequest {
  @ApiProperty()
  @IsString()
  @Length(20, 200)
  token: string;

  @ApiProperty({ minLength: PASSWORD_RULE.min })
  @IsString()
  @Length(PASSWORD_RULE.min, PASSWORD_RULE.max, { message: `Use at least ${PASSWORD_RULE.min} characters.` })
  password: string;
}

export class VerifyEmailDto implements VerifyEmailRequest {
  @ApiProperty()
  @IsString()
  @Length(20, 200)
  token: string;
}
