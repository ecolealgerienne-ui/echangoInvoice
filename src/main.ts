import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from '@fastify/helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/exception.filter';
import { requireEnv } from './config/env.config';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
  );
  const logger = new Logger('Bootstrap');

  // En-têtes de sécurité (R017)
  await app.register(helmet, {
    contentSecurityPolicy: false, // désactivé — API seule, aucun HTML servi
  });

  app.enableCors({
    origin: requireEnv('ALLOWED_ORIGINS').split(','),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    // Sans cette ligne le navigateur masque Content-Disposition au code
    // JavaScript : le nom du fichier téléchargé devrait être réinventé côté
    // client, et divergerait de celui que sert l'API.
    exposedHeaders: ['Content-Disposition'],
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  // Swagger décrit toute la surface d'API, les DTO et les champs internes :
  // hors production uniquement.
  const swaggerActif = process.env.NODE_ENV !== 'production';
  if (swaggerActif) {
  const config = new DocumentBuilder()
    .setTitle('Echango Invoice API')
    .setDescription('Multi-tenant invoicing SaaS API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
  }

  const port = parseInt(requireEnv('PORT'), 10);
  await app.listen(port, '0.0.0.0');
  logger.log(`Application running on port ${port}`);
  logger.log(`Swagger docs: http://localhost:${port}/api/docs`);
}

bootstrap();
