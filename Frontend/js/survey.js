


document.addEventListener('DOMContentLoaded', function () {
  const surveyForm = document.getElementById('surveyForm');
  const successMessage = document.getElementById('surveySuccessMessage');

  function validateSurveyForm() {
    let isValid = true;
    clearAllErrors();

    const name = document.getElementById('surveyName').value.trim();
    if (!name || name.length < 2) {
      showError('surveyNameError', 'Please enter a valid name');
      isValid = false;
    }

    const email = document.getElementById('surveyEmail').value.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      showError('surveyEmailError', 'Please enter a valid email');
      isValid = false;
    }

    const styleCheckboxes = document.querySelectorAll('input[name="style"]:checked');
    if (styleCheckboxes.length === 0) {
      showError('styleError', 'Select at least one style');
      isValid = false;
    }

    return isValid;
  }

  function showError(id, message) {
    document.getElementById(id).textContent = message;
  }

  function clearAllErrors() {
    document.querySelectorAll('.error-message').forEach(el => el.textContent = '');
  }

  function getSelectedValues(name) {
    return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(cb => cb.value);
  }

  surveyForm.addEventListener('submit', async function (e) {
    e.preventDefault();

    if (!validateSurveyForm()) return;

    const formData = {
      name: document.getElementById('surveyName').value.trim(),
      email: document.getElementById('surveyEmail').value.trim(),
      age: document.getElementById('age').value,
      style: getSelectedValues('style'),
      colors: getSelectedValues('colors'),
      budget: document.getElementById('budget').value,
      shoppingFrequency: document.getElementById('shopping').value,
      suggestions: document.getElementById('suggestions').value.trim(),
      submittedAt: new Date().toISOString()
    };

    const API_BASE = (window.location.protocol.startsWith('http') && (window.location.port === '3000' || !window.location.port)) ? '' : 'http://localhost:3000';
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const res = await fetch(`${API_BASE}/api/survey`, {
        method: 'POST',
        headers,
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        surveyForm.style.display = 'none';
        successMessage.style.display = 'block';
        setTimeout(() => window.location.href = 'index.html', 3000);
      } else {
        throw new Error('Submission failed');
      }
    } catch (err) {
      alert('Failed to submit survey');
      console.error(err);
    }
  });
});
