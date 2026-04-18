#!/usr/bin/env bash
# Generated from scripts/whip-frames.json. Edit the JSON, not this file.
# Whip crack animation — generated from whip-frames.json.
# Edit JSON waypoints, regenerate with:
#   python3 scripts/whip-render.py scripts/whip-frames.json --emit bash -o scripts/test-whip-animation.sh
# 
# Convention: ALL frames use 0.04s. Speed encoded as distance per frame.
# 
# Arm is shoulder → elbow → hand (two explicit segments). Specify elbow per
# frame for direct artistic control — IK is a fallback only.

HEIGHT=12

printf '\033[?25l'
trap 'printf "\033[?25h"' EXIT

frame() {
  printf '\033[2J\033[H'
  local row=1
  for line in "$@"; do
    printf '\033[%d;1H%s' "$row" "$line"
    (( row++ ))
  done
}

# F01 REST — hold
frame \
  "" \
  "" \
  "" \
  "" \
  "" \
  "" \
  "" \
  "[1m⡄[22m" \
  "[1m⠃[22m" \
  "[1m⢀[22m[1m⡠[22m/⢤⡀" \
  "[1m⠋[22m   ⠑⠦⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠄" \
  ""
sleep 0.04

# F02 PULL — near-end of whip lifts
frame \
  "" \
  "" \
  "" \
  "" \
  "" \
  "" \
  "" \
  "[1m⡄[22m" \
  "[1m⠃[22m" \
  "[1m⢀[22m[1m⡠[22m/⠔⠒⠦⠤⣄⣀" \
  "[1m⠋[22m       ⠈⠉⠓⠒⠦⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠄" \
  ""
sleep 0.04

# F03 PULL — hand rises 1
frame \
  "" \
  "" \
  "" \
  "" \
  "" \
  "" \
  "" \
  "[1m⣦[22m" \
  "[1m⡟[22m[1m⢀[22m/⠔⠒⠦⠤⣄⣀⡀" \
  "[1m⣧[22m[1m⠎[22m       ⠉⠙⠒⠦⠤⣄⣀" \
  "[1m⠏[22m               ⠉⠙⠒⠒⠦⠤⠤⠤⠤⠤⠤⠤⠄" \
  ""
sleep 0.04

# F04 PULL — whip midbody lifting
frame \
  "" \
  "" \
  "" \
  "" \
  "" \
  "" \
  "" \
  "[1m⣦[22m   ⡤⠤⠤⢤⣀⡀" \
  "[1m⡟[22m[1m⢀[22m/⠜     ⠉⠙⠒⠦⠤⢄⣀⡀" \
  "[1m⣧[22m[1m⠎[22m              ⠉⠉⠑⠒⠦⠤⢄⣀⡀" \
  "[1m⠏[22m                       ⠈⠉⠑⠒⠆" \
  ""
sleep 0.04

# F05 PULL — hand row 7
frame \
  "" \
  "" \
  "" \
  "" \
  "" \
  "" \
  "    ⡤⠤⠤⠤⣄⣀" \
  "[1m⣴[22m[1m⢰[22m/⠜     ⠈⠉⠓⠦⢤⣀" \
  "[1m⢿[22m[1m⣼[22m[1m⡇[22m           ⠈⠑⠦⣄⡀" \
  "[1m⢸[22m[1m⣿[22m[1m⠃[22m               ⠉⠓⠦⠤⣀⣀" \
  "[1m⢸[22m[1m⣿[22m                     ⠈⠉⠉⠓⠒⠆" \
  " [1m⠛[22m"
sleep 0.04

# F06 PULL — hand row 6
frame \
  "" \
  "" \
  "" \
  "" \
  "" \
  "    ⡤⠤⠤⠤⣄⣀" \
  " [1m⠠[22m/⠜     ⠈⠉⠓⠦⢤⣀" \
  "[1m⢤[22m [1m⣿[22m           ⠈⠙⠲⢤⡀" \
  " [1m⢣[22m[1m⢻[22m[1m⡆[22m              ⠈⠑⠦⢄⡀" \
  "  [1m⢻[22m[1m⡇[22m                  ⠈⠑⠢⢄⡀" \
  "  [1m⠈[22m[1m⠛[22m                      ⠈⠑⠆" \
  ""
sleep 0.04

# F07 PULL — hand row 5
frame \
  "" \
  "" \
  "" \
  "" \
  "    ⡤⠤⠤⠤⣄⣀" \
  "  /⠜     ⠈⠉⠓⠦⢤⣀" \
  "  [1m⢸[22m[1m⡀[22m          ⠈⠙⠲⢤⡀" \
  "[1m⠤[22m[1m⣄[22m [1m⢇[22m              ⠈⠑⠦⢄⡀" \
  " [1m⠈[22m[1m⠓[22m[1m⢼[22m[1m⡄[22m                 ⠈⠑⠢⢄⡀" \
  "                          ⠈⠑⠆" \
  "" \
  ""
sleep 0.04

# F08 PULL — hand holds, whip rising
frame \
  "" \
  "" \
  "" \
  "        ⣀⡠⠤⠤⠤⠤⠤⠤⣄⣀" \
  "    ⣠⠔⠚⠉         ⠈⠉⠓⠦⢤⣀" \
  "  /⠜⠁                 ⠈⠙⠦⣀" \
  "  [1m⢸[22m[1m⡀[22m                     ⠈⢧" \
  "[1m⠤[22m[1m⣄[22m [1m⢇[22m                       ⡇" \
  " [1m⠈[22m[1m⠓[22m[1m⢼[22m[1m⡄[22m                      ⡇" \
  "                           ⠇" \
  "" \
  ""
sleep 0.04

# F09 WINDUP — whip arcing up over
frame \
  "" \
  "            ⢀⣠⠤⠤⠤⠤⠤⣄⣀" \
  "         ⣠⠔⠊⠁       ⠈⠙⠦⣄" \
  "      ⢀⡴⠋              ⠈⢳⡀" \
  "    ⣠⠔⠋                  ⢧" \
  "  /⠜⠁                    ⡎" \
  "  [1m⢸[22m[1m⡀[22m                    ⢠⠃" \
  "[1m⠤[22m[1m⣄[22m [1m⢇[22m                    ⠜" \
  " [1m⠈[22m[1m⠓[22m[1m⢼[22m[1m⡄[22m" \
  "" \
  "" \
  ""
sleep 0.04

# F10 WINDUP — whip curling back
frame \
  "                ⣀⡤⠤⢤⡀" \
  "            ⣀⡤⠔⠋⠁   ⢧" \
  "         ⣠⠔⠋⠁       ⢸" \
  "       ⣠⠞⠁          ⡜" \
  "     ⢀⠜⠁           ⡼⠁" \
  "  [1m⠠[22m/⠔⠁            ⠜⠁" \
  "   [1m⣿[22m" \
  "[1m⢤[22m[1m⡀[22m [1m⣿[22m" \
  " [1m⠙[22m[1m⢦[22m[1m⣹[22m[1m⡇[22m" \
  "   [1m⠙[22m[1m⠃[22m" \
  "" \
  ""
sleep 0.04

# F11 PEAK — whip curled, tip trailing behind
frame \
  "                ⣀⡤⠤⢤⡀" \
  "            ⣀⡤⠔⠋⠁   ⡇" \
  "         ⣠⣴⠯⠕⠒⠒⠲⠤⠤⠔⠚⠁" \
  " ⢠⠔⠒⠦⠤⠔⣲⠟⠁" \
  " ⠜   ⢀⠜⠁" \
  "  [1m⠠[22m/⠔⠁" \
  "   [1m⣿[22m" \
  "[1m⢤[22m[1m⡀[22m [1m⣿[22m" \
  " [1m⠙[22m[1m⢦[22m[1m⣹[22m[1m⡇[22m" \
  "   [1m⠙[22m[1m⠃[22m" \
  "" \
  ""
sleep 0.04

# F12 PEAK — snake-back hold
frame \
  "                ⣀⡤⠤⢤⡀" \
  "            ⣀⡤⠔⠋⠁   ⡇" \
  "         ⣠⣴⠯⠕⠒⠒⠲⠤⠤⠔⠚⠁" \
  " ⢠⠔⠒⠦⠤⠔⣲⠟⠁" \
  " ⠜   ⢀⠜⠁" \
  "  [1m⠠[22m/⠔⠁" \
  "   [1m⣿[22m" \
  "[1m⢤[22m[1m⡀[22m [1m⣿[22m" \
  " [1m⠙[22m[1m⢦[22m[1m⣹[22m[1m⡇[22m" \
  "   [1m⠙[22m[1m⠃[22m" \
  "" \
  ""
sleep 0.04

# F13 SNAP — FAST, hand jumps to crack position
frame \
  "" \
  "" \
  "" \
  "" \
  "" \
  "" \
  "" \
  "[1m⠤[22m[1m⣄[22m         ⢀⣠⠤⠔⠒⠒⠒⠒⠒⠒⠒⠦⠤⠤⠤⠤⠤⠤⠤⠄" \
  " [1m⠈[22m[1m⠓[22m[1m⢤[22m[1m⣀[22m[1m⣀[22m[1m⠤[22m[1m⠤[22m/⠔⠊⠁" \
  "" \
  "" \
  ""
sleep 0.04

# F14 CRACK
frame \
  "" \
  "" \
  "" \
  "" \
  "" \
  "" \
  "                           \\|/" \
  "[1m⠤[22m[1m⣄[22m         ⢀⣠⠤⠔⠒⠒⠒⠒⠒⠒⠒⠦⠤⠤⠤⠤-*-" \
  " [1m⠈[22m[1m⠓[22m[1m⢤[22m[1m⣀[22m[1m⣀[22m[1m⠤[22m[1m⠤[22m/⠔⠊⠁               /|\\" \
  "" \
  "" \
  ""
sleep 0.04

# F15 SHOCKWAVE
frame \
  "" \
  "" \
  "" \
  "" \
  "" \
  "" \
  "" \
  "[1m⢤[22m[1m⡀[22m" \
  " [1m⠳[22m[1m⡀[22m   [1m⣠[22m/⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠄  ',." \
  "  [1m⠹[22m[1m⣄[22m[1m⡤[22m[1m⠋[22m                     . ." \
  "   [1m⠉[22m" \
  ""
sleep 0.04

# F16 RECOIL
frame \
  "" \
  "" \
  "" \
  "" \
  "" \
  "" \
  "" \
  "[1m⣴[22m" \
  "[1m⢻[22m[1m⡆[22m" \
  "[1m⢸[22m[1m⡇[22m  [1m⣠[22m/⠔⠒⠒⠦⠤⣄⣀" \
  " [1m⣿[22m[1m⣠[22m[1m⠞[22m[1m⠁[22m       ⠈⠉⠓⠒⠦⠤⠤⠤⠤⠤⠤⠤⠤⠤⠄ . ." \
  " [1m⠛[22m[1m⠁[22m"
sleep 0.04

# F17 SETTLING
frame \
  "" \
  "" \
  "" \
  "" \
  "" \
  "" \
  "" \
  "[1m⣦[22m" \
  "[1m⡿[22m" \
  "[1m⡇[22m [1m⣠[22m/⢤⡀" \
  "[1m⣧[22m[1m⠞[22m[1m⠁[22m  ⠉⠓⠦⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠄" \
  "[1m⠁[22m"
sleep 0.04

# F18 near REST
frame \
  "" \
  "" \
  "" \
  "" \
  "" \
  "" \
  "" \
  "[1m⡄[22m" \
  "[1m⠃[22m" \
  "[1m⢀[22m[1m⡠[22m/⢤" \
  "[1m⠋[22m  ⠈⠓⠦⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠄" \
  ""
sleep 0.04

# F19 REST
frame \
  "" \
  "" \
  "" \
  "" \
  "" \
  "" \
  "" \
  "[1m⡄[22m" \
  "[1m⠃[22m" \
  "[1m⢀[22m[1m⡠[22m/⢤⡀" \
  "[1m⠋[22m   ⠑⠦⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠄" \
  ""
sleep 0.04

# F20 REST — hold
frame \
  "" \
  "" \
  "" \
  "" \
  "" \
  "" \
  "" \
  "[1m⡄[22m" \
  "[1m⠃[22m" \
  "[1m⢀[22m[1m⡠[22m/⢤⡀" \
  "[1m⠋[22m   ⠑⠦⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠄" \
  ""
sleep 0.04

