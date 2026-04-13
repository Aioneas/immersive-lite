import { resize } from "https://deno.land/x/deno_image@0.0.4/mod.ts";

import * as fs from "https://deno.land/std@0.164.0/fs/mod.ts";
import * as path from "https://deno.land/std@0.164.0/path/mod.ts";

async function main(){
  {
    const icon = await Deno.readFile(
      'assets/icon.png',
    );
    await fs.ensureDir(path.join("src",'icons'));
    // copy icon to dist
    // await Deno.writeFile(getDistFilePath(siteIdentifier, "icon.png"), icon);
    // generate apple-touch-icon
    const sizes = [16,32,48,64,128,512]
    for (const size of sizes) {
      const appleTouchIcon = await resize(icon, {
        width: size,
        height: size,
      });
      await Deno.writeFile(
        path.join('src',"icons", `icon-${size}.png`),
        appleTouchIcon,
        {
          create: true,
        },
      );
    }
  }
}

main();
