const baseUrl = process.env.SHEETY_BASE_URL!;
const bearer = process.env.SHEETY_BEARER!;
const sheetName = process.env.SHEETY_SHEET_NAME!;

function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${bearer}`,
  };
}

function url(path = "") {
  return `${baseUrl}/${sheetName}${path}`;
}

export async function sheetyGetAll() {
  const res = await fetch(url(), {
    headers: headers(),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Sheety GET failed: ${res.status} ${await res.text()}`);
  }

  return res.json();
}

