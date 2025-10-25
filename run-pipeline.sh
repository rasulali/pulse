#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

BASE_URL="${1:-http://localhost:3000}"

echo -e "${BLUE}=== Pipeline Orchestrator ===${NC}"
echo -e "${BLUE}Base URL: ${BASE_URL}${NC}\n"

# Generate and copy SQL reset command
SQL_RESET="UPDATE pipeline_jobs
SET status = 'generating',
    retry_count = 0,
    error_message = NULL,
    current_batch_offset = 0,
    updated_at = NOW()
WHERE id = 1;"

echo -e "${YELLOW}SQL Reset Command (copied to clipboard):${NC}"
echo "$SQL_RESET"
echo "$SQL_RESET" | wl-copy

echo -e "\n${GREEN}Paste and run the SQL in Supabase SQL editor to reset the pipeline.${NC}"
echo -e "${YELLOW}Press 'y' when ready to start the orchestrator:${NC} "
read -r response

if [[ ! "$response" =~ ^[Yy]$ ]]; then
  echo -e "${RED}Aborted.${NC}"
  exit 0
fi

echo -e "\n${BLUE}Starting pipeline orchestration...${NC}"
echo -e "${BLUE}Press Ctrl+C to stop${NC}\n"

while true; do
  echo -e "${GREEN}[$(date +%H:%M:%S)] Calling /api/cron/advance...${NC}"

  response=$(curl -s -X POST "${BASE_URL}/api/cron/advance")

  echo -e "${YELLOW}Response:${NC}"
  echo "$response" | jq '.' 2>/dev/null || echo "$response"

  status=$(echo "$response" | jq -r '.current_status' 2>/dev/null)
  progress=$(echo "$response" | jq -r '.progress' 2>/dev/null)

  if [ "$status" = "completed" ]; then
    echo -e "\n${GREEN}✓ Pipeline completed!${NC}"
    break
  fi

  if [ "$status" = "failed" ]; then
    echo -e "\n${RED}✗ Pipeline failed!${NC}"
    break
  fi

  echo -e "${BLUE}Status: ${status} | Progress: ${progress}${NC}\n"

  sleep 2
done
