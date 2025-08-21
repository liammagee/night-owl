#!/bin/bash

echo "Building React components..."

# Navigate to components directory and build
cd components
npm run build

echo "Components built successfully!"
echo "Files created:"
ls -la dist/

echo ""
echo "To test the components, open test-components.html in a browser"