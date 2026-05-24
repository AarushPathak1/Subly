/**
 * Derives a short university key from a .edu email address.
 * "student@asu.edu"        → "ASU"
 * "user@mail.utexas.edu"   → "UTEXAS"
 * "foo@cs.cmu.edu"         → "CMU"
 */
function deriveUniversity(email) {
  const domain = email.split("@")[1] || "";
  const parts = domain.replace(/\.edu$/, "").split(".");
  return parts[parts.length - 1].toUpperCase();
}

module.exports = { deriveUniversity };
