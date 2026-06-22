import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { InviteDto, AcceptInviteDto } from './dto/invite.dto';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from './interfaces/jwt-payload.interface';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Register a new tenant + owner account' })
  @ApiResponse({ status: 201, description: 'Tenant created, tokens returned' })
  @ApiResponse({ status: 409, description: 'Email already used' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: 'Login and get tokens' })
  @ApiResponse({ status: 200, description: 'Tokens returned' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @ApiOperation({ summary: 'Rotate refresh token and get new pair' })
  @ApiResponse({ status: 200, description: 'New tokens returned' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user' })
  @ApiResponse({ status: 200, description: 'Current user' })
  async me(@CurrentUser() user: JwtPayload) {
    return {
      data: {
        id: user.sub,
        tenantId: user.tenantId!,
        email: user.email,
        role: user.role,
      },
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke refresh token' })
  @ApiResponse({ status: 204, description: 'Logged out' })
  async logout(
    @Body() dto: RefreshDto,
    @CurrentUser() _user: JwtPayload,
  ): Promise<void> {
    await this.authService.logout(dto.refreshToken);
  }

  @Post('invite')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles('owner', 'manager')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Inviter un collaborateur (envoie un email avec lien)' })
  @ApiResponse({ status: 201 })
  async invite(@Body() dto: InviteDto, @CurrentUser() user: JwtPayload) {
    return this.authService.invite(dto, user.tenantId!, user.sub);
  }

  @Post('accept-invite')
  @ApiOperation({ summary: 'Accepter une invitation et créer son compte' })
  @ApiResponse({ status: 201 })
  async acceptInvite(@Body() dto: AcceptInviteDto) {
    return this.authService.acceptInvite(dto);
  }
}
