const form = document.querySelector("[data-waitlist-form]");
const statusEl = document.querySelector("[data-status]");
const contactInput = document.querySelector("#contact");
const consentInput = document.querySelector("#consent");
const submitButton = document.querySelector("[data-waitlist-submit]") ?? form?.querySelector("button[type='submit']");

const joinedMessage = "You're on the beta list. I'll reach out when spots open.";

function setStatus(state, message) {
  if (!statusEl) return;
  statusEl.hidden = false;
  statusEl.dataset.state = state;
  statusEl.textContent = message;
}

function looksLikeContact(value) {
  const trimmed = value.trim();
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
  const phone = trimmed.replace(/[().\-\s]/g, "");
  return email.test(trimmed) || /^\+?[1-9]\d{7,14}$/.test(phone) || /^\d{10}$/.test(phone);
}

function restoreSubmit() {
  if (!submitButton) return;
  submitButton.disabled = false;
  submitButton.textContent = "Request invite";
}

const params = new URLSearchParams(window.location.search);
if (params.get("joined") === "1") setStatus("success", joinedMessage);
if (params.get("error") === "contact") setStatus("error", "Enter a valid email or phone number.");
if (params.get("error") === "consent") setStatus("error", "Please confirm beta contact consent.");

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const contact = contactInput?.value ?? "";
  if (!looksLikeContact(contact)) {
    setStatus("error", "Enter an email or a phone number.");
    contactInput?.focus();
    return;
  }

  if (!consentInput?.checked) {
    setStatus("error", "Please confirm beta contact consent.");
    consentInput?.focus();
    return;
  }

  if (!submitButton) return;
  submitButton.disabled = true;
  submitButton.textContent = "Joining...";
  setStatus("pending", "Adding you now.");

  try {
    const payload = Object.fromEntries(new FormData(form).entries());
    const response = await fetch(form.action, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok || body.ok !== true) {
      throw new Error(body.error || "Could not join the waitlist yet.");
    }

    submitButton.textContent = "Joined";
    setStatus("success", body.message || joinedMessage);
  } catch (error) {
    restoreSubmit();
    setStatus("error", error instanceof Error ? error.message : "Could not join the waitlist yet.");
  }
});
