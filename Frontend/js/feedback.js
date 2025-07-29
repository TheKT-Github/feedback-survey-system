

document.addEventListener('DOMContentLoaded', function () {
  const feedbackForm = document.getElementById('feedbackForm');
  const starRating = document.getElementById('starRating');
  const ratingInput = document.getElementById('rating');
  const successMessage = document.getElementById('successMessage');

  const stars = starRating.querySelectorAll('.star');
  let currentRating = 0;

  stars.forEach((star, index) => {
    star.addEventListener('click', () => {
      currentRating = index + 1;
      ratingInput.value = currentRating;
      updateStarDisplay();
      clearError('ratingError');
    });

    star.addEventListener('mouseenter', () => {
      highlightStars(index + 1);
    });
  });

  starRating.addEventListener('mouseleave', updateStarDisplay);

  function highlightStars(rating) {
    stars.forEach((star, index) => {
      star.classList.toggle('active', index < rating);
    });
  }

  function updateStarDisplay() {
    highlightStars(currentRating);
  }

  function validateForm() {
    let isValid = true;
    clearAllErrors();

    const name = document.getElementById('name').value.trim();
    if (!name) {
      showError('nameError', 'Name is required');
      isValid = false;
    } else if (name.length < 2) {
      showError('nameError', 'Name must be at least 2 characters');
      isValid = false;
    }

    const email = document.getElementById('email').value.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) {
      showError('emailError', 'Email is required');
      isValid = false;
    } else if (!emailRegex.test(email)) {
      showError('emailError', 'Please enter a valid email');
      isValid = false;
    }

    if (!currentRating) {
      showError('ratingError', 'Please select a rating');
      isValid = false;
    }

    const feedback = document.getElementById('feedback').value.trim();
    if (!feedback) {
      showError('feedbackError', 'Feedback is required');
      isValid = false;
    } else if (feedback.length < 10) {
      showError('feedbackError', 'Feedback must be at least 10 characters');
      isValid = false;
    }

    return isValid;
  }

  function showError(id, message) {
    document.getElementById(id).textContent = message;
  }

  function clearError(id) {
    document.getElementById(id).textContent = '';
  }

  function clearAllErrors() {
    document.querySelectorAll('.error-message').forEach(el => el.textContent = '');
  }

  feedbackForm.addEventListener('submit', async function (e) {
    e.preventDefault();

    if (!validateForm()) return;

    const formData = {
      name: document.getElementById('name').value.trim(),
      email: document.getElementById('email').value.trim(),
      product: document.getElementById('product').value,
      rating: parseInt(ratingInput.value),
      feedback: document.getElementById('feedback').value.trim(),  // ✅ match backend field name
      recommend: document.getElementById('recommend').checked,
      submittedAt: new Date().toISOString()
    };

    try {
      const response = await fetch('http://localhost:3000/api/feedback' ,{
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        feedbackForm.style.display = 'none';
        successMessage.style.display = 'block';
        setTimeout(() => {
          window.location.href = 'index.html';
        }, 3000);
      } else {
        throw new Error('Failed to submit feedback');
      }
    } catch (error) {
      alert('Sorry, there was an error submitting your feedback. Please try again.');
      console.error('Error:', error);
    }
  });
});
