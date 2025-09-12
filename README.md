# Doctor Appointment SaaS Backend

A robust, scalable multi-tenant backend system for doctor appointment booking, built as a modular monolith ready for microservice migration.

## 🏗️ Architecture

### Tech Stack

- **Backend**: Node.js with Express & TypeScript
- **Database**: MySQL (raw SQL, no ORM)
- **Cache**: Redis
- **Real-time**: Socket.IO
- **Authentication**: JWT (access + refresh tokens)
- **Validation**: Zod
- **Logging**: Pino
- **Documentation**: Swagger/OpenAPI
- **Testing**: Jest

### Design Principles

- **Clean Architecture** with clear separation of concerns
- **Domain-Driven Design** for business logic organization
- **Multi-tenancy** with tenant isolation at database level
- **Microservice-ready** modular structure
- **Event-driven** architecture preparation
- **Security-first** with comprehensive auth & validation

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- MySQL 8.0+
- Redis 6.0+
- npm or yarn

### Installation

1. **Clone the repository**

```bash
git clone <repository-url>
cd doctor-appointment-saas
```

2. **Install dependencies**

```bash
npm install
```

3. **Set up environment variables**

```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Set up the database**

```bash
# Create database
mysql -u root -p -e "CREATE DATABASE doctor_appointment_db;"

# Run migrations
npm run migrate

# Seed with sample data (optional)
npm run seed
```

5. **Start the development server**

```bash
npm run dev
```

The server will start at `http://localhost:3000`

### API Documentation

Once running, visit:

- **Swagger UI**: `http://localhost:3000/docs`
- **OpenAPI JSON**: `http://localhost:3000/docs/swagger.json`

## 📁 Project Structure

```
src/
├── shared/                    # Shared infrastructure
│   ├── config/               # Configuration files
│   ├── middleware/           # Express middleware
│   ├── types/                # TypeScript definitions
│   └── utils/                # Utility functions
├── domains/                  # Business domains (future microservices)
│   ├── auth/                 # Authentication & user management
│   ├── appointments/         # Appointment management
│   ├── doctors/              # Doctor profiles & availability
│   ├── patients/             # Patient profiles
│   ├── medical-notes/        # Medical records
│   ├── notifications/        # Notification system
│   └── analytics/            # Reporting & analytics
├── api/                      # API layer
├── websocket/                # Real-time WebSocket handlers
├── database/                 # Database migrations & seeds
├── app.ts                    # Express app configuration
└── server.ts                 # Server entry point
```

### Domain Structure (Example: `auth`)

```
domains/auth/
├── controllers/              # HTTP request handlers
├── services/                 # Business logic
├── repositories/             # Data access layer
├── models/                   # Domain entities
├── validators/               # Input validation schemas
├── routes/                   # API routes
└── index.ts                  # Domain exports
```

## 🔐 Authentication & Security

### Multi-Factor Authentication

- JWT access tokens (15 minutes)
- JWT refresh tokens (7 days)
- Session management with Redis
- Token blacklisting for logout
- Rate limiting on auth endpoints

### Authorization

- Role-based access control (RBAC)
- Resource-level permissions
- Tenant-isolated data access
- Request correlation tracking

### Security Features

- Helmet for security headers
- CORS configuration
- Request validation with Zod
- SQL injection prevention
- Password hashing with bcrypt
- Audit logging

## 🏢 Multi-Tenancy

### Tenant Identification

- **Header-based**: `X-Tenant-ID` or `X-Tenant-Subdomain`
- **Subdomain-based**: `tenant.yourdomain.com`
- **Host-based**: Custom domain mapping

### Data Isolation

- All database queries include `tenant_id`
- Redis keys prefixed with tenant identifier
- WebSocket rooms scoped to tenants
- File storage separated by tenant

## 📡 Real-time Features

### WebSocket Events

- Appointment creation/updates
- Doctor availability changes
- System notifications
- Typing indicators (future)

### Event Types

```typescript
// Appointment events
appointment_created;
appointment_updated;
appointment_cancelled;
appointment_reminder;

// Availability events
availability_updated;
doctor_status_changed;

// System events
system_notification;
maintenance_notice;
```

## 🗄️ Database Schema

### Core Tables

- `tenants` - Multi-tenant organization data
- `users` - User accounts with role-based access
- `doctors` - Doctor profiles and specializations
- `patients` - Patient profiles and medical info
- `appointments` - Appointment scheduling
- `doctor_availability` - Weekly schedules
- `availability_overrides` - Schedule exceptions
- `medical_notes` - Appointment notes and records
- `notifications` - System notifications
- `audit_logs` - Security and change tracking

### Key Features

- UUID primary keys
- Soft deletion support
- Automatic timestamp management
- Full-text search indexes
- Performance-optimized indexes

## 🚀 API Endpoints

### Authentication

```
POST   /api/v1/auth/register          # User registration
POST   /api/v1/auth/login             # User login
POST   /api/v1/auth/refresh           # Token refresh
POST   /api/v1/auth/logout            # User logout
GET    /api/v1/auth/me                # Current user profile
PUT    /api/v1/auth/change-password   # Change password
GET    /api/v1/auth/sessions          # User sessions
DELETE /api/v1/auth/sessions/:id      # Revoke session
```

### Appointments (Example)

```
POST   /api/v1/appointments           # Create appointment
GET    /api/v1/appointments           # List appointments
GET    /api/v1/appointments/:id       # Get appointment
PUT    /api/v1/appointments/:id       # Update appointment
DELETE /api/v1/appointments/:id       # Cancel appointment
POST   /api/v1/appointments/:id/confirm # Confirm appointment
```

## 🔧 Development

### Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run test         # Run tests
npm run test:watch   # Run tests in watch mode
npm run lint         # Lint code
npm run lint:fix     # Fix linting issues
npm run migrate      # Run database migrations
npm run seed         # Seed database with sample data
```

### Environment Variables

```bash
# Application
NODE_ENV=development
PORT=3000
APP_NAME=Doctor Appointment SaaS

# Database
DB_HOST=localhost
DB_PORT=3306
DB_NAME=doctor_appointment_db
DB_USER=your_username
DB_PASSWORD=your_password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT Secrets (change in production!)
JWT_ACCESS_SECRET=your-super-secret-access-key
JWT_REFRESH_SECRET=your-super-secret-refresh-key

# CORS Origins
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

## 🐳 Docker Setup

### Development with Docker Compose

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f api

# Stop services
docker-compose down
```

### Services Included

- **API Server** (Node.js)
- **MySQL Database**
- **Redis Cache**
- **Adminer** (Database management UI)

## 🏗️ Microservice Migration Path

### Current Modular Monolith

Each domain is structured as an independent module with:

- Clear boundaries and interfaces
- Separate data models and repositories
- Independent business logic
- Isolated API routes

### Migration Strategy

1. **Extract Domain**: Move domain folder to separate service
2. **Add API Gateway**: Route requests to appropriate services
3. **Implement Message Queue**: Replace direct calls with async messaging
4. **Database Separation**: Extract domain-specific tables
5. **Independent Deployment**: Containerize and deploy separately

### Recommended Migration Order

1. **Notifications** - Least dependent, easiest to extract
2. **Analytics** - Read-only, minimal dependencies
3. **Medical Notes** - Self-contained with clear boundaries
4. **Doctor Availability** - Moderate complexity
5. **Appointments** - High integration, migrate after dependencies
6. **Authentication** - Core service, migrate last or keep centralized

## 🧪 Testing Strategy

### Test Pyramid

- **Unit Tests**: Domain logic, services, utilities
- **Integration Tests**: Database operations, external APIs
- **E2E Tests**: Complete user workflows
- **Contract Tests**: API interface validation

### Test Categories

```bash
npm run test:unit        # Unit tests only
npm run test:integration # Integration tests
npm run test:e2e         # End-to-end tests
npm run test:coverage    # Coverage report
```

## 📊 Monitoring & Observability

### Logging

- Structured logging with Pino
- Request correlation IDs
- Security event tracking
- Performance metrics

### Health Checks

- `GET /health` - Application health
- Database connectivity
- Redis connectivity
- Memory and CPU metrics

### Metrics (Recommended)

- Request duration and rate
- Database query performance
- Cache hit/miss ratios
- WebSocket connection count
- Business metrics (appointments, users)

## 🚀 Deployment

### Production Checklist

- [ ] Update JWT secrets
- [ ] Configure CORS origins
- [ ] Set up SSL/TLS certificates
- [ ] Configure reverse proxy (Nginx)
- [ ] Set up database backups
- [ ] Configure monitoring/alerting
- [ ] Set up log aggregation
- [ ] Performance testing
- [ ] Security audit

### Environment-Specific Configs

```bash
# Production
NODE_ENV=production
LOG_LEVEL=warn
SWAGGER_ENABLED=false

# Staging
NODE_ENV=staging
LOG_LEVEL=info
SWAGGER_ENABLED=true

# Development
NODE_ENV=development
LOG_LEVEL=debug
SWAGGER_ENABLED=true
```

## 🤝 Contributing

### Development Workflow

1. Fork the repository
2. Create a feature branch
3. Make changes following coding standards
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

### Coding Standards

- TypeScript strict mode
- ESLint configuration
- Prettier formatting
- Conventional commits
- API documentation required
- Test coverage >80%

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

### Documentation

- API documentation: `/docs`
- Architecture decisions: `/docs/architecture/`
- Database schema: `/docs/database/`

### Common Issues

- **Connection refused**: Check if MySQL/Redis are running
- **JWT errors**: Verify JWT secrets are configured
- **CORS errors**: Check ALLOWED_ORIGINS configuration
- **Database errors**: Ensure migrations have been run

### Getting Help

- Create an issue in the repository
- Check existing documentation
- Review the troubleshooting guide
