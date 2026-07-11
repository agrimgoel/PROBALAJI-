// PROBALAJI AI - Inverter & Battery Expert Knowledge Base
// (Unchanged from original — safe to be public, contains no sensitive data)
const BATTERY_KNOWLEDGE = {
  "overload": {
    title: "Overload Warning (Too many appliances connected)",
    symptoms: [
      "Inverter is making a continuous long beep sound.",
      "Red Overload light is glowing.",
      "Power goes off for fans and lights."
    ],
    causes: [
      "Running heavy appliances like AC, refrigerator, microwave, geyser, or iron on the inverter.",
      "A short circuit in your house wiring."
    ],
    solutions: [
      "**Turn off heavy machines**: Switch off refrigerator, AC, geyser, heater, or iron immediately.",
      "**Reset Inverter**: Turn the main power switch on the front of the inverter OFF. Wait for 10 seconds, then turn it back ON.",
      "**Press Reset Button**: Look at the back of the inverter. If there is a small black button (circuit breaker), press it inside to reset."
    ],
    safety: "Never try to bypass or replace the fuse with a normal thin wire. This can cause a major fire or burn your inverter circuit board."
  },
  "charging": {
    title: "Battery Not Charging (Staying empty or dead)",
    symptoms: [
      "No green charging light is blinking when main electricity is on.",
      "Battery remains empty even after 8 hours of charging.",
      "Inverter stays on battery mode even when grid power is available."
    ],
    causes: [
      "White or blue rust (corrosion) on the battery terminals.",
      "Low electricity voltage in your area (below 140V).",
      "Blown fuse at the back of the inverter.",
      "Battery has become too old and weak."
    ],
    solutions: [
      "**Clean Terminals**: Switch off the inverter and unplug it. Clean white/blue rust on battery terminals using warm water mixed with baking soda and an old toothbrush.",
      "**Check Voltage**: If the main electricity voltage is too low, the inverter will not charge. Wait for voltage to return to normal.",
      "**Replace Fuse**: Look at the back of the inverter. Find the black cap labeled 'FUSE'. Unscrew and check if the wire inside is broken.",
      "**Check Water**: Check the floating indicators on top of the battery. If low, add distilled water."
    ],
    safety: "Always wear rubber gloves when cleaning terminals to avoid skin burns from acid. Never touch the red and black terminals together with a metal wrench."
  },
  "backup": {
    title: "Low Backup Duration (Battery runs out quickly)",
    symptoms: [
      "Battery drains completely within 10 to 30 minutes after power goes out.",
      "Fans and lights run slowly or stop quickly."
    ],
    causes: [
      "Low distilled water inside the battery cells.",
      "Running too many lights and fans during power cuts.",
      "Battery has become old (tubular batteries last 3-4 years, flat batteries last 2 years)."
    ],
    solutions: [
      "**Add Distilled Water**: If floats are near the RED line, unscrew caps and pour pure distilled water (NOT tap water) until float rises to the GREEN line.",
      "**Reduce the Load**: Turn off extra fans, computer screens, and extra bulbs during power cuts.",
      "**Check battery age**: If older than 3-4 years, battery plates might be damaged. Time to replace."
    ],
    safety: "Do not fill water to the very top. Leave some space, otherwise acid water will boil and overflow during charging."
  },
  "dead": {
    title: "Inverter Dead (No lights, no sound, won't turn on)",
    symptoms: [
      "Total power cut in house, but inverter has no lights and does not start.",
      "Nothing happens when you turn the power switch on."
    ],
    causes: [
      "The battery has drained completely to zero (deep discharge).",
      "Battery wires are loose or disconnected.",
      "Main house switch (MCB) has tripped."
    ],
    solutions: [
      "**Check Wire Connections**: Check if the red and black wires are connected tightly to the battery terminals. Tighten if loose.",
      "**External Charging**: If battery voltage has dropped below 10V, take it to a local shop for bench charging for 24 hours.",
      "**Check Mains MCB**: Check the main switchboard. If any switch has tripped down, toggle it up."
    ],
    safety: "A dead battery can release small amounts of gas. Keep candles, matchsticks, and cigarettes away from the battery area."
  },
  "beep": {
    title: "Beeping Sounds (What do the alarms mean?)",
    symptoms: [
      "Inverter is making beep sounds."
    ],
    causes: [
      "**Slow beep (once every few seconds)**: Grid power is gone, running on battery. This is normal.",
      "**Fast beep**: Battery is almost empty. Turn off appliances to save power.",
      "**Continuous non-stop beep**: Inverter is overloaded or there is a short circuit."
    ],
    solutions: [
      "Look at the front panel to see which light (Overload, Low Battery) is glowing.",
      "Switch off heavy items to stop the beep sound."
    ],
    safety: "If the inverter keeps beeping continuously even when you turn the switch off, unplug the inverter from the wall socket immediately."
  },
  "acid": {
    title: "Acid Leakage or Swollen Battery Box",
    symptoms: [
      "Liquid acid pooling on the floor around the battery.",
      "Battery box plastic sides look swollen, bloated, or bulged."
    ],
    causes: [
      "Inverter is overcharging the battery because of a faulty internal circuit.",
      "Battery is placed in a hot, non-ventilated room."
    ],
    solutions: [
      "**Switch off power**: Turn off the inverter switch and unplug it from the wall immediately.",
      "**Clean Spilled Acid**: Wear thick rubber gloves. Put baking soda powder on the acid pool to neutralize it. Wait 5 minutes, then wipe with water.",
      "**Replace immediately**: Do NOT use a swollen or bloated battery. It is unstable and must be replaced immediately."
    ],
    safety: "A swollen battery can burst or release hot gases. Ensure the room has open windows for fresh air."
  }
};
