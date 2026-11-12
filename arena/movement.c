/* Original independent movement approximation. Units: metres and seconds. */
static float x, y, z, vx, vy, vz, adrenaline = 100, hover;
static int jumps, mode = 1, hoverUsed, wall;
static float wallTime, savedVz;
static int dodged, hovering;
#define EXPORT __attribute__((visibility("default")))
EXPORT void reset(int m) {
  x = y = z = vx = vy = vz = hover = 0;
  adrenaline = 100;
  jumps = hoverUsed = wall = 0;
  mode = m;
  wallTime = 0;
  dodged = hovering = 0;
}
EXPORT float state(int i) {
  float a[] = {x, y, z, vx, vy, vz, adrenaline, hover, (float)wall};
  return i >= 0 && i < 9 ? a[i] : 0;
}
EXPORT void step(float dt, float ax, float ay, int jump, int crouch, int dodge,
                 int slow) {
  if (dt > .035f)
    dt = .035f;
  if (dt <= 0)
    return;
  int bullet = mode && slow && adrenaline >= 1;
  if (bullet) {
    dt *= .35f;
    adrenaline -= dt * 13;
  } else {
    adrenaline += dt * 4;
    if (adrenaline > 100)
      adrenaline = 100;
  }
  int grounded = z <= .001f;
  if (grounded) {
    jumps = 0;
    hoverUsed = 0;
    hover = 0;
    dodged = 0;
  }
  if (dodge)
    wallTime = .7f;
  else
    wallTime -= dt;
  wall = mode && !grounded &&
         ((x > 18.7f && ax > 0) || (x < -18.7f && ax < 0) ||
          (y > 18.7f && ay > 0) || (y < -18.7f && ay < 0)) &&
         wallTime > 0;
  if (jump) {
    if (grounded) {
      vz = mode && crouch ? 15 : 8;
      jumps = 1;
    } else if (wall) {
      vz = 9;
      vx = -ax * 12;
      vy = -ay * 12;
      wall = 0;
    } else if (jumps < 2 && (mode || vz > 0)) {
      vz = 8;
      jumps++;
    }
  }
  if (dodge && !dodged && (grounded || mode)) {
    dodged = 1;
    vx = ax * 15;
    vy = ay * 15;
    if (vz < 0)
      vz = 0;
    if (grounded)
      vz = 4;
  }
  float accel = grounded ? 35 : 12;
  vx += ax * accel * dt;
  vy += ay * accel * dt;
  float drag = grounded ? 7 : 1.4f;
  vx -= vx * drag * dt;
  vy -= vy * drag * dt;
  if (mode && crouch && !grounded && !hoverUsed && hover < 7) {
    if (!hovering) {
      savedVz = vz;
      hovering = 1;
    }
    vz *= 1 - 4 * dt;
    hover += dt;
  } else {
    if (hovering) {
      vz = savedVz;
      hovering = 0;
      hoverUsed = 1;
    }
    vz -= (wall ? 2 : 20) * dt;
  }
  x += vx * dt;
  y += vy * dt;
  z += vz * dt;
  if (x > 19)
    x = 19;
  if (x < -19)
    x = -19;
  if (y > 19)
    y = 19;
  if (y < -19)
    y = -19;
  if (z < 0) {
    z = 0;
    vz = 0;
  }
  if (z > 22) {
    z = 22;
    vz = 0;
  }
}
