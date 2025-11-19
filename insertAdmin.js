require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// connect using your provided MONGODB_URI
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

const userSchema = new mongoose.Schema({
  email: String,
  password: String,
  isAdmin: { type: Boolean, default: false }, // 👈 add admin flag
});

// Force collection name = "users"
const User = mongoose.model("User", userSchema, "users");

async function insertAdmin() {
  try {
    const hashedPassword = await bcrypt.hash("StrongPass123!", 10);

    const admin = new User({
      email: "admin@example.com",
      password: hashedPassword,
      isAdmin: true, // 👈 mark this user as admin
    });

    await admin.save();
    console.log("✅ Admin inserted into 'users' collection on Cluster0 with isAdmin=true");
    mongoose.connection.close();
  } catch (err) {
    console.error("❌ Error inserting admin:", err);
    mongoose.connection.close();
  }
}

insertAdmin();
