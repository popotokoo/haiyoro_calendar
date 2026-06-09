const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyhPGRwPceq-LxoEbkSmUeXig9L_SASE1FxzJgfP_x41ofwte9MeCab_i89n7ZYlDHu/exec";

exports.handler = async (event) => {
  const params = new URLSearchParams(event.queryStringParameters || {});
  const callback = params.get("callback") || "";
  params.delete("callback");

  const upstreamUrl = new URL(GOOGLE_SCRIPT_URL);
  params.forEach((value, key) => upstreamUrl.searchParams.set(key, value));

  try {
    const response = await fetch(upstreamUrl.toString(), {
      headers: {
        "Accept": "application/json",
        "User-Agent": "haiyoro-calendar/1.0",
      },
      redirect: "follow",
    });

    const body = await response.text();
    if (!response.ok) {
      return jsonResponse({ error: "upstream_failed", status: response.status, body: body.slice(0, 500) }, 502, callback);
    }

    let payload;
    try {
      payload = JSON.parse(body);
    } catch (error) {
      return jsonResponse({ error: "invalid_upstream_json", body: body.slice(0, 500) }, 502, callback);
    }

    return jsonResponse(payload, 200, callback);
  } catch (error) {
    return jsonResponse({ error: "calendar_proxy_failed", message: error.message }, 502, callback);
  }
};

function jsonResponse(payload, statusCode, callback) {
  const serialized = JSON.stringify(payload);
  const isJsonp = Boolean(callback);
  return {
    statusCode,
    headers: {
      "Content-Type": isJsonp ? "application/javascript; charset=utf-8" : "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=60",
    },
    body: isJsonp ? `${callback}(${serialized});` : serialized,
  };
}
