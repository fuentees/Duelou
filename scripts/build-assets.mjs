import sharp from "sharp";

const master = "assets/icon-master.png";

await sharp(master).resize(1024, 1024).png().toFile("assets/icon.png");
await sharp(master)
  .resize(820, 820, { fit: "contain", background: "#090B10" })
  .extend({
    top: 102,
    bottom: 102,
    left: 102,
    right: 102,
    background: "#090B10",
  })
  .png()
  .toFile("assets/adaptive-icon.png");
await sharp(master)
  .resize(512, 512, { fit: "contain", background: "#090B10" })
  .png()
  .toFile("assets/splash-icon.png");
await sharp(master).resize(64, 64).png().toFile("assets/favicon.png");
console.log("Assets de loja gerados.");
