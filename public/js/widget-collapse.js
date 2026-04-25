'use strict';

/**
 * Collapse/expand support for dashboard widgets (Radio + Signboard).
 * State is persisted per widget in localStorage. First visit defaults to
 * collapsed so the Services grid below stays the primary focus.
 *
 * Exposes window.setWidgetSummary(widgetSelector, text) so the individual
 * widget scripts can push a one-line summary used while collapsed.
 */
(function () {
  const WIDGETS = [
    {
      root: '#radio-widget',
      header: '.radio-header',
      storageKey: 'widget-collapsed:radio'
    },
    {
      root: '#signboard-widget',
      header: '.signboard-header',
      storageKey: 'widget-collapsed:signboard'
    },
    {
      root: '#podcast-widget',
      header: '.podcast-header',
      storageKey: 'widget-collapsed:podcast'
    }
  ];

  function getStored(key) {
    try {
      const v = window.localStorage.getItem(key);
      if (v === null) return true;
      return v === 'true';
    } catch (err) {
      return true;
    }
  }

  function setStored(key, value) {
    try {
      window.localStorage.setItem(key, value ? 'true' : 'false');
    } catch (err) {
      /* ignore storage failures (private mode, etc.) */
    }
  }

  function applyState(root, header, collapsed) {
    if (collapsed) {
      root.classList.add('collapsed');
    } else {
      root.classList.remove('collapsed');
    }
    const expanded = collapsed ? 'false' : 'true';
    header.setAttribute('aria-expanded', expanded);
    const toggleBtn = header.querySelector('.widget-collapse-toggle');
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', expanded);
  }

  function wireWidget(cfg) {
    const root = document.querySelector(cfg.root);
    if (!root) return;
    const header = root.querySelector(cfg.header);
    if (!header) return;

    let collapsed = getStored(cfg.storageKey);
    applyState(root, header, collapsed);

    function toggle() {
      collapsed = !collapsed;
      applyState(root, header, collapsed);
      setStored(cfg.storageKey, collapsed);
    }

    header.addEventListener('click', toggle);

    header.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  }

  window.setWidgetSummary = function (widgetSelector, text) {
    const root = document.querySelector(widgetSelector);
    if (!root) return;
    const summary = root.querySelector('.widget-summary');
    if (!summary) return;
    summary.textContent = text || '';
  };

  function init() {
    WIDGETS.forEach(wireWidget);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
