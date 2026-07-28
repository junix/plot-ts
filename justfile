# plot-ts - TypeScript plotting library

# Set shell
set shell := ["zsh", "-c"]

# Default target
default:
    @just --list

# Build TypeScript
build:
    npm run build 2>/dev/null || npx tsc

# Run TypeScript check
check:
    npx tsc --noEmit

# Run all demos
demo:
    npx tsx src/cli.ts all --out out

# Run specific demo
run demo_id:
    npx tsx src/cli.ts run {{demo_id}} --out out

# List demos
list:
    npx tsx src/cli.ts list

# Install npm dependencies
install:
    npm install

# Clean build artifacts
clean:
    rm -rf dist out

# Build + test
test:
    @echo "No tests yet"

# Show help
help:
    @just --list
