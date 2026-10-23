import { createApp } from "./app.js";
const { app } = createApp({ demo: process.env.CHAO_DEMO === "1" });
const port = Number(process.env.PORT || 3001);
app.listen(port, "0.0.0.0", () =>
  console.log(`Chao API listening on port ${port}`),
);
