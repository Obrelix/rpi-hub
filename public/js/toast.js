/**
 * showToast — display a transient notification in the top-right corner.
 *
 * @param {string} message     Text to display
 * @param {string} type        'success' | 'error' | 'warning' | 'info'  (default: 'info')
 * @param {number} durationMs  How long before auto-dismiss              (default: 4000)
 */
function showToast(message, type = 'info', durationMs = 4000) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'opacity 0.3s, transform 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, durationMs);
}
