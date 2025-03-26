export default [
    {
      languageOptions: {
        parserOptions: {
          ecmaVersion: 2021,
          sourceType: "module",
        },
        globals: {
          // Add any global variables here, if needed
          // For example:
          // process: "readonly",
          // __dirname: "readonly"
        },
      },
      rules: {
        // Add your custom ESLint rules here
      },
    },
    {
      // Manually include the config objects for recommended rules
      settings: {
        react: {
          version: "detect", // If you're using React, specify the version
        },
      },
      rules: {
        // Add or override any rules you want
      },
    },
  ];
  