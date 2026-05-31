#!/bin/bash
# Monitor EPG import progress

LOG_FILE="/Users/romolovelati/Desktop/programmitnt.fr/scripts/import.log"

echo "Monitoring EPG import progress..."
echo "Press Ctrl+C to stop"
echo ""

while true; do
    if [ -f "$LOG_FILE" ]; then
        # Get latest progress
        LATEST=$(tail -5 "$LOG_FILE" | grep "Inserted batch" | tail -1)
        if [ ! -z "$LATEST" ]; then
            TOTAL=$(echo "$LATEST" | grep -oP 'total: \K[0-9]+')
            echo "[$(date +%H:%M:%S)] Progress: $TOTAL programs inserted"
        fi
        
        # Check if completed
        if grep -q "EPG Import Completed Successfully" "$LOG_FILE"; then
            echo ""
            echo "✅ Import completed!"
            tail -10 "$LOG_FILE" | grep -E "(Summary|Channels|Programs|Deleted)"
            break
        fi
        
        # Check if failed
        if grep -q "EPG Import Failed" "$LOG_FILE"; then
            echo ""
            echo "❌ Import failed!"
            tail -20 "$LOG_FILE"
            break
        fi
    fi
    
    sleep 10
done
