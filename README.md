# Feedback & Survey Management System

A web-based application for collecting and managing user feedback and survey responses. Built using **HTML**, **CSS**, **JavaScript**, **Node.js**, and **MongoDB**.

---

## ✨ Features

- 💬 Feedback form with optional image upload
- 📋 Custom survey form
- 🔐 Admin login with access control
- 📊 Admin dashboard to view submissions
- ☁️ MongoDB integration for storing data
- 🎨 Light, minimal, and responsive UI

---

## 📁 Project Structure

## 📁 Project Structure

feedback-survey-system/
│
├── Backend/
│   ├── config/          # MongoDB connection setup
│   ├── models/          # Mongoose models for Feedback and Survey
│   ├── routes/          # Express routes (feedback, survey, admin)
│   └── server.js        # Main Node.js server file
│
├── Frontend/
│   ├── index.html       # Home page
│   ├── feedback.html    # Feedback form page
│   ├── survey.html     # Survey form page
│   ├── admin.html      # Admin dashboard
│   ├── admin-login.html# Admin login page
│   ├── css/
│   │   └── style.css   # Common styles
│   └── js/
│       ├── admin.js    # Admin dashboard logic
│       ├── feedback.js # Feedback form logic
│       └── survey.js   # Survey form logic
│
├── .env.example         # Example environment config
├── .gitignore           # Ignored files/folders
├── package.json         # Node.js dependencies
└── README.md            # Project documentation



## 🛠 Tech Stack
- Frontend: HTML, CSS, JavaScript
- Backend: Node.js, Express.js
- Database: MongoDB
- Authentication: Admin Login (Session/JWT)



