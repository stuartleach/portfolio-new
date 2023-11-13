import { defineConfig, UserConfigExport } from "vite";

import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
const envVariablesToForward: string[] = [
  "NODE_ENV",
  "API_ORIGIN",
  "CLIENT_ORIGIN",
  "GOOGLE_CLIENT_ID",
];
const pullValuesFromEnv = (keys, env) => {
  return keys.reduce((acc, curr) => {
    acc[`process.env.${curr}`] = JSON.stringify(env[curr]);
    return acc;
  }, {});
};

const getConfig = (env) => {
  // any process.env values desired for use on the frontend must be specified here
  const define = pullValuesFromEnv(envVariablesToForward, env);
  const commonConfig: UserConfigExport = {
    define,
    plugins: [tsconfigPaths(), react()],
  };

  if (env.NODE_ENV === "production") {
    return defineConfig({
      ...commonConfig,
      optimizeDeps: {
        force: true,
      },
      build: {
        sourcemap: true,
      },
    });
  }

  return defineConfig({
    ...commonConfig,
    server: {
      port: 3000,
    },
    preview: {
      port: 3000,
    },
  });
};

// https://vitejs.dev/config/
export default getConfig(process.env);
