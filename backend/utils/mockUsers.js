import bcrypt from "bcryptjs";

const mockUsers = [
  {
    id: "1",
    email: "owner@test.com",
    password: bcrypt.hashSync("owner123", 10),
    role: "owner",
    isActive: true,
  },
  {
    id: "2",
    email: "staff@test.com",
    password: bcrypt.hashSync("staff123", 10),
    role: "staff",
    isActive: true,
  },
];

export default mockUsers;