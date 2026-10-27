const app = document.querySelector("#app");

if (app === null) {
  throw new Error('Pixelquill could not start: missing "#app" element.');
}

app.textContent = "Pixelquill";
