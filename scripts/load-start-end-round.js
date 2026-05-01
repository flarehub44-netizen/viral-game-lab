import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL ?? "";
const JWT = __ENV.JWT ?? "";
const API_KEY = __ENV.API_KEY ?? "";
const STAKE = Number(__ENV.STAKE ?? 1);

if (!BASE_URL || !JWT || !API_KEY) {
  throw new Error("Defina BASE_URL, JWT e API_KEY para o teste de carga.");
}

export const options = {
  stages: [
    { duration: "2m", target: 50 },
    { duration: "5m", target: 150 },
    { duration: "10m", target: 300 },
    { duration: "2m", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
  },
};

function invoke(path, payload) {
  return http.post(`${BASE_URL}/${path}`, JSON.stringify(payload), {
    headers: {
      Authorization: `Bearer ${JWT}`,
      apikey: API_KEY,
      "Content-Type": "application/json",
      "x-device-fingerprint": `k6-${__VU}`,
    },
  });
}

export default function () {
  const idem = `${__VU}-${__ITER}-${Date.now()}`;
  const startRes = invoke("start-round", {
    stake_amount: STAKE,
    mode: "target_20x",
    idempotency_key: idem,
  });
  check(startRes, {
    "start-round status 200": (r) => r.status === 200,
  });
  if (startRes.status !== 200) {
    sleep(1);
    return;
  }

  const startPayload = JSON.parse(startRes.body);
  const endRes = invoke("end-round", {
    round_id: startPayload.round_id,
    alive: 0,
    layout_seed: startPayload.layout_seed,
    layout_signature: startPayload.layout_signature,
    barriers_passed: 5,
  });
  check(endRes, {
    "end-round status 200": (r) => r.status === 200,
  });
  sleep(1);
}
