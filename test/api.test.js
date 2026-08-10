const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../server");

describe("Complete Book Management & Auth API Test Suite", () => {
  let tokenUserA, tokenUserB, tokenAdmin;
  let refreshTokenUserA;
  let bookIdUserA;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(
        process.env.MONGO_URI || "mongodb://127.0.0.1:27017/myCrudAppTest",
      );
    }
    await mongoose.connection.dropDatabase();
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe("1. User Registration & Validation", () => {
    it("should register User A (Book Owner)", async () => {
      const res = await request(app).post("/api/auth/register").send({
        name: "User A",
        email: "usera@example.com",
        password: "Password123!",
        role: "user",
      });
      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty("userId");
    });

    it("should register User B (Second Regular User)", async () => {
      const res = await request(app).post("/api/auth/register").send({
        name: "User B",
        email: "userb@example.com",
        password: "Password123!",
        role: "user",
      });
      expect(res.statusCode).toBe(201);
    });

    it("should register Admin User", async () => {
      const res = await request(app).post("/api/auth/register").send({
        name: "Admin User",
        email: "admin@example.com",
        password: "Password123!",
        role: "admin",
      });
      expect(res.statusCode).toBe(201);
    });

    it("should reject registration with an existing email", async () => {
      const res = await request(app).post("/api/auth/register").send({
        name: "Duplicate User",
        email: "usera@example.com",
        password: "Password123!",
        role: "user",
      });
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/already registered|already exists/i);
    });
  });

  describe("2. Login & JWT Token Retrieval", () => {
    it("should reject invalid login credentials", async () => {
      const res = await request(app).post("/api/auth/login").send({
        email: "usera@example.com",
        password: "WrongPassword123!",
      });
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });

    it("should successfully log in User A and capture cookies & access token", async () => {
      const res = await request(app).post("/api/auth/login").send({
        email: "usera@example.com",
        password: "Password123!",
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty("accessToken");
      tokenUserA = res.body.accessToken;

      const cookies = res.headers["set-cookie"];
      expect(cookies).toBeDefined();
      refreshTokenUserA = cookies.find((cookie) =>
        cookie.startsWith("refreshToken="),
      );
      expect(refreshTokenUserA).toBeDefined();
    });

    it("should log in User B and capture access token", async () => {
      const res = await request(app).post("/api/auth/login").send({
        email: "userb@example.com",
        password: "Password123!",
      });
      expect(res.statusCode).toBe(200);
      tokenUserB = res.body.accessToken;
    });

    it("should log in Admin and capture access token", async () => {
      const res = await request(app).post("/api/auth/login").send({
        email: "admin@example.com",
        password: "Password123!",
      });
      expect(res.statusCode).toBe(200);
      tokenAdmin = res.body.accessToken;
    });
  });

  describe("3. Route Protection Middleware", () => {
    it("should reject unauthenticated request to protected endpoints", async () => {
      const res = await request(app).get("/api/books");
      expect(res.statusCode).toBe(401);
    });

    it("should reject request with invalid Bearer token", async () => {
      const res = await request(app)
        .get("/api/books")
        .set("Authorization", "Bearer invalid_token_string");
      expect(res.statusCode).toBe(401);
    });
  });

  describe("4. Book Creation Restrictions", () => {
    it("should allow regular User A to create a book and save Foreign Key (createdBy)", async () => {
      const res = await request(app)
        .post("/api/books")
        .set("Authorization", `Bearer ${tokenUserA}`)
        .send({
          title: "Clean Code",
          author: "Robert C. Martin",
          isbn: "9780132350884",
          price: 35.0,
          stock: 5,
          category: "Technology",
        });

      expect(res.statusCode).toBe(201);
      const book = res.body.book || res.body;
      expect(book).toHaveProperty("_id");

      bookIdUserA = book._id;
    });

    it("should reject book creation attempt by Admin role", async () => {
      const res = await request(app)
        .post("/api/books")
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({
          title: "Admin Test Book",
          author: "Admin Author",
          price: 10.0,
        });

      expect(res.statusCode).toBe(403);
      console.log("CRASH ERROR RESPONSE:", res.body);
    });
  });

  describe("5. Read Scoping & Privacy Rules", () => {
    it("should return empty list for User B who has created no books", async () => {
      const res = await request(app)
        .get("/api/books")
        .set("Authorization", `Bearer ${tokenUserB}`);

      expect(res.statusCode).toBe(200);
      const books = res.body.data || res.body.books || res.body;
      expect(books.length).toBe(0);
    });

    it("should return User A's created book when requested by User A", async () => {
      const res = await request(app)
        .get("/api/books")
        .set("Authorization", `Bearer ${tokenUserA}`);

      expect(res.statusCode).toBe(200);
      const books = res.body.data || res.body.books || res.body;
      expect(books.length).toBe(1);
    });

    it("should allow Admin to see all books across all users", async () => {
      const res = await request(app)
        .get("/api/books")
        .set("Authorization", `Bearer ${tokenAdmin}`);

      expect(res.statusCode).toBe(200);
      const books = res.body.data || res.body.books || res.body;
      expect(books.length).toBeGreaterThanOrEqual(1);
    });

    it("should return FULL book details when Owner views their own book", async () => {
      const res = await request(app)
        .get(`/api/books/${bookIdUserA}`)
        .set("Authorization", `Bearer ${tokenUserA}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty("price");
      expect(res.body).toHaveProperty("isbn");
    });

    it("should return MASKED availability status only when another User views the book", async () => {
      const res = await request(app)
        .get(`/api/books/${bookIdUserA}`)
        .set("Authorization", `Bearer ${tokenUserB}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty("isAvailable", true);
      expect(res.body).toHaveProperty("status");
      expect(res.body).not.toHaveProperty("price");
    });
  });

  describe("6. Update & Delete Ownership Restrictions", () => {
    it("should prevent User B from updating User A's book", async () => {
      const res = await request(app)
        .put(`/api/books/${bookIdUserA}`)
        .set("Authorization", `Bearer ${tokenUserB}`)
        .send({ price: 10.0 });

      expect(res.statusCode).toBe(403);
    });

    it("should allow User A to update their own book", async () => {
      const res = await request(app)
        .put(`/api/books/${bookIdUserA}`)
        .set("Authorization", `Bearer ${tokenUserA}`)
        .send({ price: 29.99 });

      expect(res.statusCode).toBe(200);
    });

    it("should prevent User B from deleting User A's book", async () => {
      const res = await request(app)
        .delete(`/api/books/${bookIdUserA}`)
        .set("Authorization", `Bearer ${tokenUserB}`);

      expect(res.statusCode).toBe(403);
    });

    it("should allow Admin to delete any book (Admin Override)", async () => {
      const res = await request(app)
        .delete(`/api/books/${bookIdUserA}`)
        .set("Authorization", `Bearer ${tokenAdmin}`);

      expect(res.statusCode).toBe(200);
    });
  });

  describe("7. Refresh Token Rotation & Session Revocation", () => {
    it("should issue a new access token when passing a valid refresh token cookie", async () => {
      const res = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", [refreshTokenUserA]);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty("accessToken");
    });

    it("should revoke tokens on logout and clear session", async () => {
      const res = await request(app)
        .post("/api/auth/logout")
        .set("Cookie", [refreshTokenUserA]);

      expect(res.statusCode).toBe(200);
    });

    it("should reject refresh attempt after token has been logged out", async () => {
      const res = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", [refreshTokenUserA]);

      expect(res.statusCode).toBe(403);
    });
  });
});
