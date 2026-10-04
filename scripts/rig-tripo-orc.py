"""Blender: build a weighted skeleton and bake planted-foot walk / punch clips."""
import bpy
import bmesh
import math
import numpy as np
from pathlib import Path
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[1]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(ROOT / 'public/models/tripo-orc.glb'))
mesh = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
# The reconstructed concept has a three-quarter pose, about 30 degrees off +X.
# Correct the mesh before binding, so the face/body and the gait share game +Z.
turn = Matrix.Rotation(math.radians(-120), 4, 'Z')
for v in mesh.data.vertices:
    v.co = turn @ mesh.matrix_world @ v.co
mesh.matrix_world = Matrix.Identity(4)
low = Vector(tuple(min(v.co[c] for v in mesh.data.vertices) for c in range(3)))
high = Vector(tuple(max(v.co[c] for v in mesh.data.vertices) for c in range(3)))
center = (low + high) * .5
scale = 2.9 / (high.z - low.z)
for v in mesh.data.vertices:
    v.co = (v.co - Vector((center.x, center.y, low.z))) * scale
# Weld only coincident vertices; Blender retains the UVs on face corners.
bm = bmesh.new()
bm.from_mesh(mesh.data)
bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.00001)
bm.to_mesh(mesh.data)
bm.free()
mesh.data.validate(clean_customdata=False)
mesh.data.update()
mesh.name = 'TripoOrc'

def smooth(a, b, value):
    t = max(0, min(1, (value-a)/(b-a)))
    return t*t*(3-2*t)

# Facial controls are shape keys on the original surface, retaining its painted UVs.
# The eye and mouth landmarks were measured on the aligned mesh in the review view.
mesh.shape_key_add(name='Basis')
blink = mesh.shape_key_add(name='Blink')
jaw = mesh.shape_key_add(name='JawOpen')
brow = mesh.shape_key_add(name='BrowTense')
eye_centers = [(-.035, 2.444), (.16, 2.410)]
jaw_pivot = Vector((.06, 2.325, .22))
jaw_rotation = Matrix.Rotation(math.radians(12), 3, 'X')
for vertex in mesh.data.vertices:
    p = Vector((vertex.co.x, vertex.co.z, -vertex.co.y))
    x, y, z = p
    front = smooth(.27, .34, z)
    close_y, tense_y = 0, 0
    for cx, cy in eye_centers:
        radius = math.sqrt(((x-cx)/.085)**2 + ((y-cy)/.048)**2)
        weight = (1-smooth(.58, 1.35, radius))*front
        close_y += (cy-.006-y)*weight
        brow_radius = math.sqrt(((x-cx)/.11)**2 + ((y-cy-.06)/.055)**2)
        inner = 1-smooth(.025, .09, abs(x-.06))
        tense_y += (-.023*inner+.008*(1-inner))*(1-smooth(.3, 1, brow_radius))*front
    blink.data[vertex.index].co.z += close_y
    brow.data[vertex.index].co.z += tense_y
    lower_lip = 1-smooth(2.265, 2.302, y)
    tusk = max(1-smooth(.023, .055, abs(x-cx)) for cx in [-.09, .19])
    tusk *= 1-smooth(2.35, 2.39, y)
    jaw_weight = max(lower_lip, tusk)*smooth(2.105, 2.18, y)
    jaw_weight *= smooth(.22, .34, z)*(1-smooth(.20, .29, abs(x-.06)))
    moved = p.lerp(jaw_pivot+jaw_rotation@(p-jaw_pivot), jaw_weight)
    jaw.data[vertex.index].co = Vector((moved.x, -moved.z, moved.y))

# Lengthen ankle-to-hip proportions by 12%, retaining the same overall 2.9 m height.
# The upper body keeps its width; its vertical extent absorbs the modest change.
LEG_SCALE = 1.12
LEG_GAIN = (1.16-.18)*(LEG_SCALE-1)
UPPER_SCALE = (2.9-1.16-LEG_GAIN)/(2.9-1.16)
def proportion(y):
    if y <= .18:
        return y
    if y <= 1.16:
        return .18+(y-.18)*LEG_SCALE
    return 1.16+LEG_GAIN+(y-1.16)*UPPER_SCALE
for key in mesh.data.shape_keys.key_blocks:
    for point in key.data:
        point.co.z = proportion(point.co.z)
for vertex in mesh.data.vertices:
    vertex.co = mesh.data.shape_keys.key_blocks['Basis'].data[vertex.index].co
mesh.data.update()

def vec(p):
    return Vector(p)

def blender(p):
    return Vector((p[0], -p[2], p[1]))

rest = {}
def bone(name, head, tail, parent=None):
    rest[name] = (vec((head[0], proportion(head[1]), head[2])),
                  vec((tail[0], proportion(tail[1]), tail[2])), parent)

bone('pelvis', (0, 1.12, -.04), (0, 1.35, -.04))
bone('spine', (0, 1.35, -.04), (0, 2.08, -.04), 'pelvis')
bone('head', (0, 2.08, -.04), (0, 2.83, -.04), 'spine')
for side, label in [(-1, 'left'), (1, 'right')]:
    shoulder = (side * .55, 2.06, -.02)
    elbow = (side * .78, 1.55, .07)
    wrist = (side * .84, 1.08, .18)
    # The sculpt is asymmetric: the punching arm sits behind the chest.
    # Its old mirrored pivots were in front of the elbow/wrist, rotating the
    # flesh around empty space and folding the biceps into the forearm.
    if side > 0:
        shoulder = (.68, 2.06, -.12)
        elbow = (.86, 1.55, -.14)
        wrist = (.94, 1.08, -.015)
    bone(label + 'UpperArm', shoulder, elbow, 'spine')
    bone(label + 'Forearm', elbow, wrist, label + 'UpperArm')
    bone(label + 'Hand', wrist, (.94, .94, .085) if side > 0 else (side * .85, .94, .28), label + 'Forearm')
    bone(label + 'ShoulderPlate', (side*.57, 2.08, -.06), (side*.82, 2.08, -.06), 'spine')
    hip = (side * .34, 1.16, -.02)
    knee = (side * .44, .62, .08)
    ankle = (side * .48, .18, .12)
    bone(label + 'Thigh', hip, knee, 'pelvis')
    bone(label + 'Shin', knee, ankle, label + 'Thigh')
    bone(label + 'Foot', ankle, (side * .48, .08, .50), label + 'Shin')

armature = bpy.data.armatures.new('TripoOrcSkeleton')
rig = bpy.data.objects.new('TripoOrcRig', armature)
bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
mesh.select_set(False)
bpy.ops.object.mode_set(mode='EDIT')
for name, (head, tail, parent) in rest.items():
    eb = armature.edit_bones.new(name)
    eb.head, eb.tail = blender(head), blender(tail)
    eb.use_deform = not name.endswith('ShoulderPlate')
    if parent:
        eb.parent = armature.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
mesh.select_set(True)
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
for name in ['leftShoulderPlate', 'rightShoulderPlate']:
    armature.bones[name].use_deform = True
    mesh.vertex_groups.new(name=name)
# Bone heat can produce a few weights just above one; clamp them before saving/export.
mesh.data.validate()
if not mesh.vertex_groups or any(not v.groups for v in mesh.data.vertices):
    raise RuntimeError('Automatic bone weighting did not cover the entire mesh')

def replace_weights(vertex, weights):
    total = sum(weights.values())
    if total <= 0:
        raise RuntimeError('Anatomical weighting left an unbound vertex')
    for group in list(vertex.groups):
        if group.group not in weights or weights[group.group] <= .000001:
            mesh.vertex_groups[group.group].remove([vertex.index])
    for group, weight in weights.items():
        if weight > .000001:
            mesh.vertex_groups[group].add([vertex.index], weight/total, 'REPLACE')

arm_groups = {mesh.vertex_groups[side+part].index
              for side in ['left', 'right'] for part in ['UpperArm', 'Forearm', 'Hand']}
spine_group = mesh.vertex_groups['spine'].index
for vertex in mesh.data.vertices:
    x, y = vertex.co.x, vertex.co.z
    weights = {g.group: g.weight for g in vertex.groups}
    # The collar/trapezius is torso, not biceps. Remove arm influence from the
    # inner collar and blend across the deltoid instead of pulling neck faces up.
    collar = (1-smooth(.42, .64, abs(x-.03)))*smooth(1.72, 1.98, y)
    removed = sum(w*collar for g, w in weights.items() if g in arm_groups)
    if removed > .000001:
        weights = {g: w*(1-collar) if g in arm_groups else w for g, w in weights.items()}
        weights[spine_group] = weights.get(spine_group, 0)+removed
        replace_weights(vertex, weights)
    # Hands/forearms must not inherit leg or torso motion. Keep the closed fist
    # rigid, with a short transition at the wrist and the elbow.
    side = 'right' if x > 0 else 'left'
    upper = mesh.vertex_groups[side+'UpperArm'].index
    lower = mesh.vertex_groups[side+'Forearm'].index
    hand = mesh.vertex_groups[side+'Hand'].index
    own_arm = sum(weights.get(g, 0) for g in [upper, lower, hand])
    if abs(x) > .50 and y > .65 and own_arm > .05:
        wrist_y = rest[side+'Hand'][0].y
        elbow_y = rest[side+'Forearm'][0].y
        hand_weight = 1-smooth(wrist_y-.035, wrist_y+.065, y)
        upper_weight = smooth(elbow_y-.10, elbow_y+.10, y)
        # Keep the whole forearm and biceps volumes, limiting blends to the
        # actual elbow and outer shoulder. The front pectoral stays on the chest.
        arm_weight = smooth(.50, .73, abs(x))
        chest = (1-smooth(.55, .76, abs(x)))*smooth(.15, .31, -vertex.co.y)*smooth(1.55, 1.83, y)
        arm_weight *= 1-chest
        # Below the elbow every arm vertex belongs to the arm, including its
        # inner surface. Blend torso influence only at the shoulder.
        arm_weight = 1-(1-arm_weight)*smooth(1.72, 2.02, y)
        target_weights = {hand: hand_weight*arm_weight, upper: upper_weight*arm_weight,
                          lower: (1-hand_weight-upper_weight)*arm_weight, spine_group: 1-arm_weight}
        membership = smooth(.05, .45, own_arm)
        blended = {g: w*(1-membership) for g,w in weights.items()}
        for g,w in target_weights.items():
            blended[g] = blended.get(g,0)+w*membership
        replace_weights(vertex, blended)

# Shoulder plates are rigid equipment. Identify their metal with the original
# PBR map and bind them to a cap that follows the shoulder as a rigid piece.
orm = next(node.image for node in mesh.active_material.node_tree.nodes
           if node.type == 'TEX_IMAGE' and node.label == 'METALLIC ROUGHNESS')
width, height = orm.size[:]
pixels = np.empty(width*height*4, dtype=np.float32)
orm.pixels.foreach_get(pixels)
color_image = next(node.image for node in mesh.active_material.node_tree.nodes
                   if node.type == 'TEX_IMAGE' and node.label == 'BASE COLOR')
colors = np.empty(width*height*4, dtype=np.float32)
color_image.pixels.foreach_get(colors)
armor = set()
strap = set()
uv = mesh.data.uv_layers.active.data
for loop in mesh.data.loops:
    vertex = mesh.data.vertices[loop.vertex_index]
    x, y, z = vertex.co.x, vertex.co.z, -vertex.co.y
    if (1.40 < y < 2.24 and z > .23) or (.22 < abs(x) < 1.10 and 1.89 < y < 2.63):
        coord = uv[loop.index].uv
        u = max(0, min(width-1, int(coord.x*(width-1))))
        v = max(0, min(height-1, int(coord.y*(height-1))))
        pixel = (v*width+u)*4
        metal = pixels[pixel+2]
        r, g, b = colors[pixel:pixel+3]
        leather = r > g*1.12 and r > b*1.25
        ivory = r > g*1.02 and b > g*.60 and r > .4
        head_weight = next((g.weight for g in vertex.groups if g.group == mesh.vertex_groups['head'].index), 0)
        on_strap = 1.40 < y < 2.24 and z > .23 and abs(x-(.45-.975*(y-1.30))) < .20
        if on_strap and (leather or metal > .3):
            strap.add(vertex.index)
        elif .22 < abs(x) < 1.10 and 1.89 < y < 2.63 and (y < 2.28 or abs(x) > .48) and ((head_weight < .45 and (metal > .30 or leather)) or (ivory and (x < -.32 or x > .48))):
            armor.add(vertex.index)
for index in armor:
    vertex = mesh.data.vertices[index]
    side = 1 if vertex.co.x > 0 else -1
    label = 'right' if side > 0 else 'left'
    replace_weights(vertex, {mesh.vertex_groups[label+'ShoulderPlate'].index: 1})
for vertex in mesh.data.vertices:
    x, y, z = vertex.co.x, vertex.co.z, -vertex.co.y
    # Ivory spikes are continuous pieces even where the texture darkens.
    if x < -.30 and y > 2.25 and z < .22:
        replace_weights(vertex, {mesh.vertex_groups['leftShoulderPlate'].index: 1})
for index in strap:
    replace_weights(mesh.data.vertices[index], {spine_group: 1})
# Blend only equipment/skin seams. The source joins armor to the body, so an
# abrupt 100% plate / 100% arm boundary stretches the connecting triangles.
neighbors = [set() for _ in mesh.data.vertices]
for edge in mesh.data.edges:
    a, b = edge.vertices
    neighbors[a].add(b)
    neighbors[b].add(a)
weights = [{g.group: g.weight for g in v.groups if g.weight > .000001} for v in mesh.data.vertices]
seams = {v.index for v in mesh.data.vertices if
         (v.co.x > .4 and 1.5 < v.co.z < 2.45) or
         (v.co.x < -.4 and 1.7 < v.co.z < 2.3)}
for iteration in range(64):
    updated = {}
    for i in seams:
        v = mesh.data.vertices[i]
        if v.co.x > 0:
            amount = .65*smooth(.4,.5,v.co.x)*smooth(1.5,1.72,v.co.z)*(1-smooth(2.35,2.45,v.co.z))
        else:
            if iteration >= 24:
                continue
            amount = .65*smooth(.4,.5,abs(v.co.x))*smooth(1.7,1.82,v.co.z)*(1-smooth(2.22,2.3,v.co.z))
        neighbor_weights = {n: (1/max(.0001, (v.co-mesh.data.vertices[n].co).length) if v.co.x > 0 else 1) for n in neighbors[i]}
        neighbor_total = sum(neighbor_weights.values())
        result = {g: w*(1-amount) for g,w in weights[i].items()}
        for n in neighbors[i]:
            for g,w in weights[n].items():
                result[g] = result.get(g,0)+w*amount*neighbor_weights[n]/neighbor_total
        updated[i] = result
    for i,result in updated.items():
        weights[i] = result
for i in seams:
    replace_weights(mesh.data.vertices[i], weights[i])
print('SMOOTH_ARMOR_SEAMS', len(seams))
del pixels, colors
print('RIGID_SHOULDER_ARMOR', len(armor))
# Align the actual face, not just its bone: its painted eye centers reveal both
# sideways cant and a yaw away from the body's forward direction.
head_group = mesh.vertex_groups['head'].index
# The skull and its sockets must follow the same transform as the eyeballs.
# Bone heat leaves torso influence even around the eyes; retain that blend only
# through the neck, rather than letting a shoulder turn shear the face.
for vertex in mesh.data.vertices:
    weights = {g.group: g.weight for g in vertex.groups}
    weight = weights.get(head_group, 0)
    shoulder_seam = vertex.co.x > .4 and vertex.co.z < 2.30
    if weight <= (.001 if shoulder_seam else .45):
        continue
    rigid = smooth(2.12, 2.30, vertex.co.z)
    if shoulder_seam:
        rigid *= smooth(.15, .85, weight)
    if rigid == 0:
        continue
    target = weight+(1-weight)*rigid
    remaining = sum(w for group, w in weights.items() if group != head_group)
    for group, w in weights.items():
        if group != head_group:
            mesh.vertex_groups[group].add([vertex.index], w*(1-target)/remaining if remaining else 0, 'REPLACE')
    mesh.vertex_groups[head_group].add([vertex.index], target, 'REPLACE')
source_eyes = [Vector((-.0291998, 2.4710503, .3470792)),
               Vector((.1801304, 2.4433662, .4000714))]
source_center = (source_eyes[0]+source_eyes[1])*.5
right = (source_eyes[1]-source_eyes[0]).normalized()
up = (Vector((0, 1, 0))-right*right.y).normalized()
forward = right.cross(up).normalized()
face_alignment = Matrix((right, up, forward))
# Keep the face centered above the measured neck stem instead of the AABB center.
target_center = Vector((.07, source_center.y, source_center.z))
conversion = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))
straighten = conversion@face_alignment@conversion.inverted()
source_pivot, target_pivot = blender(source_center), blender(target_center)
for vertex in mesh.data.vertices:
    weight = next((g.weight for g in vertex.groups if g.group == head_group), 0)
    blend = smooth(.2, .8, weight)
    if blend > 0:
        for key in mesh.data.shape_keys.key_blocks:
            p = key.data[vertex.index].co
            key.data[vertex.index].co = p.lerp(target_pivot+straighten@(p-source_pivot), blend)
    vertex.co = mesh.data.shape_keys.key_blocks['Basis'].data[vertex.index].co
mesh.data.update()
eye_centers = [target_center+face_alignment@(p-source_center) for p in source_eyes]
mesh['orc_eye_centers'] = [float(c) for p in eye_centers for c in p]
mesh['orc_face_right'] = [float(c) for c in face_alignment@right]
mesh['orc_face_forward'] = [float(c) for c in face_alignment@forward]
# Keep the original sculpted eye surfaces and eyelids intact.
for pb in rig.pose.bones:
    pb.rotation_mode = 'QUATERNION'

def ik(hip, ankle, length1, length2, pole=None):
    delta = ankle - hip
    if delta.length > length1 + length2 + .000001:
        raise RuntimeError('Walk target exceeds the fixed leg length')
    distance = min(delta.length, length1 + length2 - .00001)
    direction = delta.normalized()
    along = (length1 * length1 - length2 * length2 + distance * distance) / (2 * distance)
    bend = Vector((0, 0, 1)) if pole is None else pole.copy()
    bend = (bend - direction * bend.dot(direction)).normalized()
    return hip + direction * along + bend * math.sqrt(max(0, length1 * length1 - along * along))

def rotate_x(v, angle):
    return Matrix.Rotation(angle, 3, 'X') @ v

STRIDE = 1.4
STANCE = .6

def foot_pose(phase, side):
    """Heel contact, flat support, toe push-off, then a continuous returning swing."""
    flat_rotation = Matrix.Rotation(math.radians(-side*12), 3, 'Y')
    def stance(cycle):
        base = Vector((side*.30, .18, -.02+STRIDE*(STANCE*.5-cycle)))
        if cycle < .12:
            pitch = math.radians(-16)*(1-smooth(0, .12, cycle))
            pivot = flat_rotation @ Vector((0, -.18, -.13))
        else:
            pitch = math.radians(28)*smooth(.44, STANCE, cycle)
            pivot = flat_rotation @ Vector((0, -.18, .36))
        roll = Matrix.Rotation(pitch, 3, 'X')
        return base+pivot-roll@pivot, pitch
    cycle = phase % 1
    if cycle <= STANCE:
        ankle, pitch = stance(cycle)
    else:
        t = (cycle-STANCE)/(1-STANCE)
        start, start_pitch = stance(STANCE)
        end, end_pitch = stance(0)
        # Matching the backward velocity at both ends avoids a stop at each half-step.
        h00, h10 = 2*t**3-3*t*t+1, t**3-2*t*t+t
        h01, h11 = -2*t**3+3*t*t, t**3-t*t
        tangent = Vector((0, 0, -STRIDE*(1-STANCE)))
        ankle = start*h00+tangent*h10+end*h01+tangent*h11
        ankle.y += .105*math.sin(math.pi*t)**2
        pitch = start_pitch+(end_pitch-start_pitch)*smooth(0, 1, t)
    return ankle, Matrix.Rotation(pitch, 3, 'X') @ flat_rotation

def pose(walk=0, phase=0, punch_time=None, breath=0):
    beat = phase*math.tau
    breathing = math.sin(breath*math.tau)
    active, strike, lift = 0, 0, 0
    if punch_time is not None:
        active = smooth(0, .20, punch_time)*(1-smooth(.78, 1.0, punch_time))
        lift = smooth(.04, .32, punch_time)*(1-smooth(.59, .75, punch_time))
        # Accelerate downward, hold the impact across the .55 s hit frame,
        # then recoil before the arm settles. The fist strikes with its bottom.
        drop = max(0, min(1, (punch_time-.36)/.18))**2
        strike = drop*(1-smooth(.59, .75, punch_time))
    offset = Vector((-.035*math.sin(beat+.3)*walk,
                     (-.075+.025*math.cos(2*(beat-.27*math.tau)))*walk+.004*breathing-.035*strike,
                     .06*strike))
    pelvis_rotation = Matrix.Rotation(.075*math.cos(beat)*walk+.035*active-.07*strike, 3, 'Y')
    pelvis_rotation @= Matrix.Rotation(.018*math.sin(beat+.3)*walk, 3, 'Z')
    torso_rotation = Matrix.Rotation(-.055*math.cos(beat)*walk+.10*active-.12*strike, 3, 'Y')
    torso_rotation @= Matrix.Rotation(.025*walk+.009*breathing-.025*active+.12*strike, 3, 'X')
    torso_rotation @= Matrix.Rotation(-.012*math.sin(beat+.3)*walk+.035*active*(1-strike), 3, 'Z')
    # The head stays upright and forward. Gaze moves through the eyes, not neck tilt.
    head_rotation = Matrix.Identity(3)
    desired = {}
    rotations = {'pelvis': pelvis_rotation, 'spine': torso_rotation, 'head': head_rotation}
    for name in ['pelvis', 'spine', 'head']:
        head, tail, parent = rest[name]
        placed = head+offset if parent is None else desired[parent][1]
        desired[name] = (placed, placed+rotations[name]@(tail-head))
    for side, label in [(-1, 'left'), (1, 'right')]:
        head, knee_rest, _ = rest[label + 'Thigh']
        _, ankle_rest, _ = rest[label + 'Shin']
        hip = desired['pelvis'][0]+pelvis_rotation@(head-rest['pelvis'][0])
        target, foot_rotation = foot_pose(phase + (0 if side < 0 else .5), side)
        neutral, _ = foot_pose(.3, side)
        ankle = neutral.lerp(target, walk)
        knee = ik(hip, ankle, (knee_rest-head).length, (ankle_rest-knee_rest).length)
        desired[label + 'Thigh'] = (hip, knee)
        desired[label + 'Shin'] = (knee, ankle)
        fh, ft, _ = rest[label + 'Foot']
        idle_rotation = Matrix.Rotation(math.radians(-side*12), 3, 'Y').to_quaternion()
        foot_rotation = idle_rotation.slerp(foot_rotation.to_quaternion(), walk).to_matrix()
        rotations[label+'Foot'] = foot_rotation
        desired[label + 'Foot'] = (ankle, ankle + foot_rotation @ (ft - fh))
        shoulder, elbow_rest, _ = rest[label + 'UpperArm']
        _, wrist_rest, _ = rest[label + 'Forearm']
        sh = desired['spine'][0]+torso_rotation@(shoulder-rest['spine'][0])
        swing = math.cos((phase+(0 if side < 0 else .5))*math.tau)
        angle = .34*swing*walk
        forearm_angle = angle-(.08+.08*(1-swing))*walk
        elbow = sh + torso_rotation@rotate_x(elbow_rest - shoulder, angle)
        wrist = elbow + torso_rotation@rotate_x(wrist_rest - elbow_rest, forearm_angle)
        hand_direction = torso_rotation@rotate_x(rest[label+'Hand'][1]-rest[label+'Hand'][0], forearm_angle)
        if punch_time is not None and side < 0:
            # Bake the free arm at rest. Runtime also holds its incoming pose,
            # including during clip blends, so it never raises into a guard.
            sh, elbow, wrist = shoulder.copy(), elbow_rest.copy(), wrist_rest.copy()
            hand_direction = rest[label+'Hand'][1]-rest[label+'Hand'][0]
        elif active > 0:
            guard = Vector((.80, 1.70, .28)).lerp(Vector((.82, 2.48, .48)), lift)
            guard = guard.lerp(Vector((.38, 1.57, .66)), strike)
            wrist = wrist.lerp(guard, active)
            elbow = ik(sh, wrist, (elbow_rest-shoulder).length,
                       (wrist_rest-elbow_rest).length, Vector((side*.35, -1.0, 0)))
            # A neutral wrist follows the forearm, rather than folding the fist
            # ninety degrees across it at the top of the raise.
            # Both segments share the elbow hinge plane. Independently aiming
            # each bone can roll one segment against the other when the fist
            # moves above the shoulder, twisting the skin into stacked folds.
            def limb_frame(direction, normal):
                along = direction.normalized()
                across = normal.normalized()
                return Matrix((across, along, across.cross(along).normalized())).transposed()
            rest_normal = (elbow_rest-shoulder).cross(wrist_rest-elbow_rest)
            posed_normal = (elbow-sh).cross(wrist-elbow)
            upper_rotation = (elbow_rest-shoulder).rotation_difference(elbow-sh).to_matrix()
            # Keep one anatomical hinge direction for the entire clip. Choosing
            # the normal's sign per frame caused a 180-degree wrist flip on return.
            hinge_rotation = limb_frame(elbow-sh, posed_normal)@limb_frame(elbow_rest-shoulder, rest_normal).transposed()
            upper_rotation = upper_rotation.to_quaternion().slerp(hinge_rotation.to_quaternion(), .5).to_matrix()
            rotations[label+'UpperArm'] = upper_rotation
            forearm_rotation = limb_frame(wrist-elbow, posed_normal)@limb_frame(wrist_rest-elbow_rest, rest_normal).transposed()
            rotations[label+'Forearm'] = forearm_rotation
            hand_direction = forearm_rotation@(rest[label+'Hand'][1]-rest[label+'Hand'][0])
            rotations[label+'Hand'] = forearm_rotation
        desired[label + 'UpperArm'] = (sh, elbow)
        desired[label + 'Forearm'] = (elbow, wrist)
        hh, ht, _ = rest[label + 'Hand']
        desired[label + 'Hand'] = (wrist, wrist + hand_direction.normalized()*(ht-hh).length)
        # Keep the cap in the same frame as the upper arm at its attachment.
        ph, pt, _ = rest[label+'ShoulderPlate']
        arm_rotation = (elbow_rest-shoulder).rotation_difference(elbow-sh)
        cap_rotation = rotations.get(label+'UpperArm', arm_rotation.to_matrix())
        cap_head = sh+cap_rotation@(ph-shoulder)
        desired[label+'ShoulderPlate'] = (cap_head, cap_head+cap_rotation@(pt-ph))
        rotations[label+'ShoulderPlate'] = cap_rotation
    for name, (head, tail) in desired.items():
        rh, rt, _ = rest[name]
        rotation = (blender(rt)-blender(rh)).rotation_difference(blender(tail)-blender(head))
        if name in rotations:
            conversion = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))
            rotation = (conversion@rotations[name]@conversion.inverted()).to_quaternion()
        matrix = rotation.to_matrix().to_4x4() @ armature.bones[name].matrix_local.copy()
        matrix.translation = blender(head)
        rig.pose.bones[name].matrix = matrix
        bpy.context.view_layer.update()

def action(name, frames, apply):
    rig.animation_data_create()
    rig.animation_data.action = bpy.data.actions.new(name)
    for frame in range(frames + 1):
        bpy.context.scene.frame_set(frame)
        apply(frame / frames)
        for pb in rig.pose.bones:
            pb.keyframe_insert('location', frame=frame)
            pb.keyframe_insert('rotation_quaternion', frame=frame)
            pb.keyframe_insert('scale', frame=frame)
    rig.animation_data.action.use_fake_user = True

bpy.context.scene.render.fps = 48
action('Idle', 192, lambda t: pose(breath=t))
action('Walk', 48, lambda t: pose(walk=1, phase=t))
action('Punch', 48, lambda t: pose(punch_time=t))
rig.animation_data.action = None
pose()
bpy.context.scene.frame_set(0)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'assets/enemies/tripo-orc-rig.blend'))
bpy.ops.export_scene.gltf(
    filepath=str(ROOT / 'public/models/tripo-orc-rigged.glb'),
    export_format='GLB', export_animations=True, export_animation_mode='ACTIONS',
    export_force_sampling=True, export_frame_range=False, export_skins=True,
    export_all_influences=False, export_yup=True, export_extras=True,
)
print('TRIPO_RIG_COMPLETE', len(mesh.data.vertices), list(bpy.data.actions.keys()))
