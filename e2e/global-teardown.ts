import { execSync } from "child_process"
import path from "path"

export default function globalTeardown() {
  const apiDir = path.resolve(process.cwd(), "apps/api")
  execSync("npm run db:reset:local", {
    cwd: apiDir,
    stdio: "inherit",
  })
}
