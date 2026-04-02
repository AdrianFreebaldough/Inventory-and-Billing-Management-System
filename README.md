cd Inventory-and-Billing-Management-System then cd frontend

always run this before mag code 

    npx tailwindcss -i ./frontend/css/input.css -o ./frontend/css/output.css --watch

server for backend "npx nodemon server.js"

## Environment setup

Copy `.env.example` (if you have one) to `.env` and fill in the connection strings. Example values are:

```dotenv
PORT=3000
JWT_SECRET=supersecretkey123

# IBMS Database (Read‑only or writable depending on account)
# replace `YOUR_PASSWORD_HERE` with the actual MongoDB user password:
IBMS_DB_URI=mongodb+srv://rixoncode_db_user:YOUR_PASSWORD_HERE@clinic-management-syste.ozlt3bo.mongodb.net/ibms?retryWrites=true&w=majority

# Optional fallback/alternate database
PARMS_DB_URI=mongodb+srv://rixoncode_db_user:YOUR_PASSWORD_HERE@clinic-management-syste.ozlt3bo.mongodb.net/PARMS?retryWrites=true&w=majority
```

> **Authentication errors** occur when the username/password in the URI is wrong; update the password and restart the script.

## Seeding the database

From the `backend` folder run:

```bash
node seedUsersIBMS.js
```

The script will print the (masked) URI it tries to connect with and then create two users. If you see

```
Seeding failed: bad auth : authentication failed
```

make sure the credentials in `IBMS_DB_URI` (or `PARMS_DB_URI` if you use the fallback) are correct. No documents will be written until the connection succeeds.

