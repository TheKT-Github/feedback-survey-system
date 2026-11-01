

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

    const photoInput = document.getElementById('photo');
    const hasPhoto = photoInput && photoInput.files && photoInput.files.length > 0;

    // Validate photo size and type if selected
    if (hasPhoto) {
      const file = photoInput.files[0];
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!validTypes.includes(file.type.toLowerCase())) {
        alert('Invalid image format. Only JPEG, PNG, and WEBP images are allowed.');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        alert('Image is too large. Maximum allowed size is 5 MB.');
        return;
      }
    }

    const payload = new FormData();
    payload.append('name', document.getElementById('name').value.trim());
    payload.append('email', document.getElementById('email').value.trim());
    payload.append('product', document.getElementById('product').value);
    payload.append('rating', ratingInput.value);
    payload.append('feedback', document.getElementById('feedback').value.trim());
    payload.append('recommend', document.getElementById('recommend').checked);
    payload.append('submittedAt', new Date().toISOString());

    if (hasPhoto) {
      payload.append('photo', photoInput.files[0]);
    }

    const API_BASE = (window.location.protocol.startsWith('http') && (window.location.port === '3000' || !window.location.port)) ? '' : 'http://localhost:3000';
    const token = localStorage.getItem('token');
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(`${API_BASE}/api/feedback`, {
        method: 'POST',
        headers,
        body: payload
      });

      const data = await response.json();

      if (response.ok && data.success) {
        feedbackForm.reset();
        currentRating = 0;
        updateStarDisplay();
        const preview = document.getElementById("photoPreview");
        if (preview) preview.innerHTML = "";

        successMessage.style.display = 'block';
        successMessage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        // Automatically refresh customer reviews below to show the new submission
        if (typeof window.loadPublicFeedbacks === 'function') {
          window.loadPublicFeedbacks(1);
        }

        setTimeout(() => {
          successMessage.style.display = 'none';
        }, 5000);
      } else {
        alert(data.error || data.message || 'Failed to submit feedback');
      }
    } catch (error) {
      alert('Sorry, there was an error submitting your feedback. Please try again.');
      console.error('Error:', error);
    }
  });
});
