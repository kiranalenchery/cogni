// src/embed/exp2.ts
import { embedDocument } from "./embed";

try {
  const vec = await embedDocument("test sentence");
  console.log("Success, vector length:", vec.length);
} catch (err) {
  console.log("FULL ERROR:", err);
}