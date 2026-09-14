# Backend Authentication Template

A clean Node.js backend template with user authentication, role-based access control, and user management features.

## Features

- **User Authentication**

  - Login with username/password
  - JWT token-based authentication
  - Refresh token support
  - Password change functionality
  - Logout with token invalidation

- **User Management**

  - Create, read, update, delete users
  - Role-based permissions
  - Password reset functionality
  - User profile management

- **Role-Based Access Control (RBAC)**

  - Super Admin, Admin, and User roles
  - Permission-based access control
  - Middleware for route protection

- **Database**
  - Prisma ORM with MySQL
  - Clean database schema
  - Migration support

## Tech Stack

- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **Prisma** - Database ORM
- **MySQL** - Database
- **JWT** - Authentication tokens
- **bcryptjs** - Password hashing
- **Nodemailer** - Email functionality

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- MySQL database
- npm or yarn

### Installation

1. Clone the repository

```bash
git clone <repository-url>
cd backend-auth-template
```

2. Install dependencies

```bash
npm install
```

3. Set up environment variables
   Create a `.env` file in the root directory:

```env
DATABASE_URL="mysql://username:password@localhost:3306/database_name"
JWT_SECRET="your-jwt-secret-key"
JWT_REFRESH_SECRET="your-refresh-secret-key"
EMAIL_HOST="smtp.gmail.com"
EMAIL_PORT=587
EMAIL_USER="your-email@gmail.com"
EMAIL_PASS="your-app-password"
```

4. Set up the database

```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations
npx prisma migrate dev --name init

# Seed the database with default data
npm run seed
```

5. Start the development server

```bash
npm run dev
```

The server will start on `http://localhost:3000`

## API Endpoints

### Authentication

- `POST /api/auth/login` - User login
- `POST /api/auth/refresh-token` - Refresh access token
- `POST /api/auth/logout` - User logout (requires authentication)
- `POST /api/auth/change-password` - Change password (requires authentication)

### User Management

- `GET /api/users` - Get all users (requires MANAGE_USERS permission)
- `GET /api/users/me` - Get current user profile (requires authentication)
- `GET /api/users/:id` - Get user by ID (requires MANAGE_USERS permission)
- `POST /api/users/add` - Create new user (requires MANAGE_USERS permission)
- `PUT /api/users/:id` - Update user (requires MANAGE_USERS permission)
- `PUT /api/users/:id/reset-password` - Reset user password (requires MANAGE_USERS permission)
- `DELETE /api/users/:id` - Delete user (requires MANAGE_USERS permission)

## Default Users

After running the seed command, the following users will be created:

- **Super Admin**: `superadmin` / `123321`
- **Admin**: `admin` / `admin123`
- **User**: `user` / `user123`

## Database Schema

The template includes the following models:

- `user` - User accounts with authentication data
- `role` - User roles (Super Admin, Admin, User)
- `permission` - System permissions
- `role_permission` - Many-to-many relationship between roles and permissions
- `log` - Activity logs

## Project Structure

```
src/
├── controllers/
│   ├── auth.controller.js    # Authentication controller (imports handlers)
│   └── user.controller.js    # User management controller (imports handlers)
├── handlers/
│   ├── auth/
│   │   ├── login.handler.js           # Login logic
│   │   ├── logout.handler.js          # Logout logic
│   │   ├── refreshToken.handler.js    # Refresh token logic
│   │   ├── changePassword.handler.js  # Change password logic
│   │   └── getProfile.handler.js      # Get profile logic
│   ├── user/
│   │   ├── getAllUsers.handler.js     # Get all users logic
│   │   ├── getUserById.handler.js     # Get user by ID logic
│   │   ├── createUser.handler.js      # Create user logic
│   │   ├── updateUser.handler.js      # Update user logic
│   │   ├── deleteUser.handler.js      # Delete user logic
│   │   └── resetPassword.handler.js   # Reset password logic
│   └── index.js                       # Handler exports
├── validators/
│   ├── auth.validator.js     # Authentication validators
│   ├── user.validator.js     # User management validators
│   └── index.js              # Validator exports
├── middleware/
│   ├── auth.js              # JWT authentication middleware
│   ├── checkPermission.js   # Permission checking middleware
│   ├── checkRole.js         # Role checking middleware
│   └── role.middleware.js   # Role-related middleware
├── routes/
│   ├── auth.routes.js       # Authentication routes
│   ├── user.routes.js       # User management routes
│   └── index.js             # Main router
├── utils/
│   ├── jwt.js               # JWT utility functions
│   ├── logger.js            # Logging utilities
│   └── email.js             # Email utilities
└── server.js                # Main server file
```

## Architecture Benefits

### Modular Structure

- **Handlers**: Each business logic is separated into individual handler files
- **Validators**: Input validation is centralized and reusable
- **Controllers**: Act as thin layers that import and use handlers
- **Routes**: Clean route definitions with middleware and validation

### Benefits

- **Maintainability**: Easy to find and modify specific functionality
- **Testability**: Each handler can be tested independently
- **Reusability**: Handlers and validators can be reused across different routes
- **Scalability**: Easy to add new features without affecting existing code
- **Code Organization**: Clear separation of concerns

## Customization

### Adding New Handlers

1. Create a new handler file in the appropriate folder (`src/handlers/auth/` or `src/handlers/user/`)
2. Export the handler function
3. Import and use it in the controller
4. Add the route in the appropriate route file

### Adding New Validators

1. Create validation logic in the appropriate validator file
2. Export the validator function
3. Use it as middleware in your routes

### Adding New Permissions

1. Add the permission to the seed file (`prisma/seed.js`)
2. Update the role assignments as needed
3. Use the permission in your middleware

### Adding New User Fields

1. Update the Prisma schema (`prisma/schema.prisma`)
2. Run migration: `npx prisma migrate dev`
3. Update handlers and validators as needed

### Adding New Routes

1. Create handler functions
2. Create validators if needed
3. Add routes to the appropriate route file
4. Apply appropriate middleware for authentication/permissions

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the ISC License.
