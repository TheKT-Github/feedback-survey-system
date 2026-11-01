const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, "Username is required"],
    unique: true,
    trim: true,
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    unique: true,
    sparse: true,
  },
  password: {
    type: String,
    required: [true, "Password is required"],
  },
  role: {
    type: String,
    enum: ["customer", "admin"],
    default: "customer",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Pre-save hook: Hash password with bcrypt before saving
UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  // Prevent double-hashing if password is already a bcrypt hash
  if (this.password && (this.password.startsWith("$2a$") || this.password.startsWith("$2b$") || this.password.startsWith("$2y$"))) {
    return next();
  }
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Instance method to compare password with bcrypt or legacy plaintext migration
UserSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;

  // If already a bcrypt hash
  if (this.password.startsWith("$2a$") || this.password.startsWith("$2b$") || this.password.startsWith("$2y$")) {
    return bcrypt.compare(candidatePassword, this.password);
  }

  // Legacy fallback: plain text match
  if (this.password === candidatePassword) {
    // Automatically migrate legacy password to secure bcrypt hash
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(candidatePassword, salt);
    await this.save();
    return true;
  }

  return false;
};

// Never expose password or __v in JSON output
UserSchema.set("toJSON", {
  transform: function (doc, ret) {
    delete ret.password;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("user", UserSchema);

