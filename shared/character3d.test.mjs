import test from "node:test";
import assert from "node:assert/strict";
import { avatarOptions } from "./avatar.mjs";
import { characterMesh, projectCharacter } from "./character3d.mjs";
test("combat mesh uses fewer faces without losing depth or full rotation", () => {
  for (const species of avatarOptions.species) {
    const avatar = { species: species.id, color: "violet", accessory: "crown", frame: "round" };
    const compact = characterMesh(avatar, false, true);
    const portrait = characterMesh(avatar);
    assert.ok(compact.length < portrait.length * 0.7);
    for (let angle = 0; angle < 7; angle++) {
      const projected = projectCharacter(compact, angle);
      assert.ok(projected.length > 20);
      assert.ok(projected.every(f => !/NaN|Infinity/.test(f.points)));
    }
  }
});

test("108 cosmetics produce finite 3D meshes and visible faces through a full turn", () => {
  let count = 0;
  for (const species of avatarOptions.species) for (const color of avatarOptions.color)
    for (const accessory of avatarOptions.accessory) for (const frame of avatarOptions.frame) {
      const mesh = characterMesh({ species: species.id, color: color.id, accessory: accessory.id, frame: frame.id });
      assert.ok(mesh.length < 1000);
      assert.ok(mesh.every(f => f.points.every(p => p.length === 3 && p.every(Number.isFinite))));
      const depths = mesh.flatMap(f => f.points.map(p => p[2]));
      assert.ok(Math.max(...depths) - Math.min(...depths) > 0.5, "actual depth");
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
        const view = projectCharacter(mesh, angle);
        assert.ok(view.length > 20);
        assert.ok(view.every(f => !/NaN|Infinity/.test(f.points)));
        assert.ok(view.every((f,i) => !i || f.depth >= view[i-1].depth));
      }
      count++;
    }
  assert.equal(count, 108);
});

test("back view hides the face and exposes different geometry", () => {
  const mesh = characterMesh(null);
  const front = projectCharacter(mesh,0), back = projectCharacter(mesh,Math.PI);
  assert.notDeepEqual(front, back);
  assert.ok(front.some(f => mesh[f.id].color === "#AEFFE5"));
  // Eye surfaces face the front; their front-facing polygons are culled at 180°.
  const frontEyes = front.filter(f => mesh[f.id].color === "#AEFFE5").map(f=>f.id);
  assert.ok(!back.some(f => frontEyes.includes(f.id)));
});
