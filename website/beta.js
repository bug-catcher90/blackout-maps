(function () {
  var dialog = document.querySelector("[data-beta]");
  var openers = document.querySelectorAll("[data-beta-open]");
  if (!dialog || !openers.length) return;

  var form = dialog.querySelector("[data-beta-form]");
  var email = form.querySelector('input[name="email"]');
  var honeypot = form.querySelector('input[name="website"]');
  var error = dialog.querySelector("[data-beta-error]");
  var submit = form.querySelector('button[type="submit"]');
  var formStep = dialog.querySelector('[data-beta-step="form"]');
  var doneStep = dialog.querySelector('[data-beta-step="done"]');
  var doneTitle = dialog.querySelector("[data-beta-done-title]");
  var EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

  function open() {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    document.documentElement.classList.add("beta-open");
    if (doneStep.hidden) email.focus();
    else doneTitle.focus();
  }

  function close() {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function showError(text) {
    error.textContent = text;
    email.setAttribute("aria-invalid", text ? "true" : "false");
    if (text) email.focus();
  }

  for (var i = 0; i < openers.length; i++) openers[i].addEventListener("click", open);
  dialog.querySelector("[data-beta-close]").addEventListener("click", close);
  dialog.addEventListener("close", function () { document.documentElement.classList.remove("beta-open"); });
  dialog.addEventListener("click", function (event) {
    if (event.target === dialog) close();
  });
  email.addEventListener("input", function () { if (error.textContent) showError(""); });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var value = email.value.trim();
    if (!value || value.length > 254 || !EMAIL.test(value)) {
      showError("Enter a valid email address.");
      return;
    }
    showError("");
    submit.disabled = true;
    submit.textContent = "Sending…";
    fetch("/api/beta-signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: value, website: honeypot.value })
    })
      .then(function (response) {
        if (response.ok) {
          formStep.hidden = true;
          doneStep.hidden = false;
          doneTitle.focus();
          return;
        }
        if (response.status === 400) showError("Enter a valid email address.");
        else if (response.status === 429) showError("Too many tries. Try again in an hour.");
        else showError("Something went wrong. Try again.");
      })
      .catch(function () { showError("No connection. Try again."); })
      .then(function () {
        submit.disabled = false;
        submit.textContent = "Join the beta";
      });
  });
})();
