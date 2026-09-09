# Backend

This folder contains the backend code for Talent Bridge AI.

## Structure

- Source code, APIs, database models, and server logic go here.
- Keep configuration files (e.g., environment templates) in this directory.

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- MongoDB (installed and running locally on the default port 27017)

### Installation

1. Navigate to the backend directory:

   ```bash
   cd backend
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Set up environment variables:
   - Copy the example environment file:

     ```bash
     cp .env.example .env
     ```
   - Adjust the variables in `.env` if needed (for example, if you want to use a different port, MongoDB URI, or JWT secret).

### Running the Server

To start the development server:

```bash
npm start
```

The server will run on `http://localhost:5000` by default.

### Project Structure

- `server.js`: The main entry point for the Express server.
- `.env.example`: Example environment variables.
- `.env`: Actual environment variables (not committed to git).
- `package.json`: Project metadata and dependencies.

### MongoDB Connection

The backend connects to a local MongoDB instance. By default, it uses the connection string:

```bash
mongodb://localhost:27017/talentbridge
```

Make sure your MongoDB server is running before starting the backend.

## API Endpoints

### Public Routes

- `GET /`: Returns a JSON message indicating the API is running.
- `POST /api/register`: Register a new user
  - Body: `{ email, password, role? }`
  - Returns: JWT token and user info
- `POST /api/login`: Login user
  - Body: `{ email, password }`
  - Returns: JWT token and user info

### Protected Routes

- `GET /api/dashboard`: Example protected route (requires JWT token in Authorization header)
  - Header: `Authorization: Bearer <token>`
  - Returns: User info and welcome message

### Extending the Backend

To add new features:

1. Create new route files in a `routes` directory.
2. Define Mongoose models in a `models` directory.
3. Import and use the routes and models in `server.js`.

## Troubleshooting

- If you encounter MongoDB connection errors, verify that:
  - MongoDB is installed and running.
  - The connection string in `.env` is correct.
  - The database `talentbridge` exists (it will be created automatically on first save).

- If you encounter JWT authentication errors:
  - Ensure you are sending the token in the Authorization header as `Bearer <token>`.
  - Check that the JWT secret in `.env` matches the one used to sign tokens.

## License

ISC