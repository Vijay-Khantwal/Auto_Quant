function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

function getCSRFToken() {
  return getCookie('csrftoken') || '';
}

async function apiFetch(url, options = {}) {
  const csrfToken = getCSRFToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(csrfToken ? { 'X-CSRFToken': csrfToken } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers,
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    throw new Error(`API error ${res.status}: ${errorText}`);
  }

  return res.json();
}

export function fetchSignals() {
  return apiFetch('/api/signals/');
}

export function fetchDebate(signalId) {
  return apiFetch(`/api/debate/${signalId}/`);
}

export function postJevCheck(signalId, qty) {
  return apiFetch(`/api/jev-check/`, {
    method: 'POST',
    body: JSON.stringify({ signal_id: signalId, quantity: qty }),
  });
}

export function postTrade(signalId, debateId, decision, qty) {
  return apiFetch(`/api/trade/`, {
    method: 'POST',
    body: JSON.stringify({
      signal_id: signalId,
      debate_id: debateId,
      decision,
      quantity: qty,
    }),
  });
}

export function postChat(message, signalId) {
  return apiFetch(`/api/chat/`, {
    method: 'POST',
    body: JSON.stringify({ message, signal_id: signalId }),
  });
}

export function fetchPortfolio() {
  return apiFetch('/api/portfolio/');
}
