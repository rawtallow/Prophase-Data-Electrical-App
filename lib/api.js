// Shared client-side fetch helpers.
//
// Every list page re-fetches its rows after a save/delete. Doing that with a
// bare `fetch(url).then(r => r.json())` is a crash waiting to happen: if the
// request comes back 403 (role changed), 500, or an HTML login redirect
// (session expired), the page sets its rows state to a non-array and the very
// next `.filter()`/`.map()` throws, blanking the screen. These helpers make
// the failure explicit so callers can keep the data they already have on
// screen and surface a toast instead.

export async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    let message = 'Could not load the latest data';
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // Non-JSON body (e.g. an HTML error page) — keep the generic message.
    }
    throw new Error(message);
  }
  return res.json();
}

// Same as getJson, but guarantees an array so list rendering can't blow up on
// an unexpected shape.
export async function getList(url) {
  const data = await getJson(url);
  return Array.isArray(data) ? data : [];
}
