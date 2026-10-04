"""Apply the second silhouette pass to the live Blender scene through MCP.

Also called by the replacement builder before painting. Mesh properties make
the pass idempotent when an artist reruns it on the saved source.
"""
import math


def refine(models, game, world):
    changed = []
    for obj in models:
        if obj.get('concept_silhouette_pass') == 2:
            continue
        name = obj.name
        bone = obj['creature_bone']
        spike = name.startswith('Pauldron / ivory spike')
        points = [game(v.co) for v in obj.data.vertices]
        if spike:
            bottom = min(p.y for p in points)
            center_x = sum(p.x for p in points) / len(points)
            center_z = sum(p.z for p in points) / len(points)
        edited = False
        for vertex, p in zip(obj.data.vertices, points):
            if name.startswith('Pauldron /') and bone == 'leftArm':
                if spike:
                    p.x = center_x + (p.x-center_x)*1.32
                    p.z = center_z + (p.z-center_z)*1.32
                    p.y = 1.94 + (bottom-1.94)*1.36 + (p.y-bottom)*.86
                elif name.startswith(('Pauldron / hammered','Pauldron / ivory')):
                    p.y = 1.94 + (p.y-1.94)*1.36
                    p.z *= 1.09
                else:
                    p.y += .045
                    p.z *= 1.09
                edited = True
            elif name.startswith(('Apron / long central', 'Apron / tongue')):
                p.x *= 1.38
                p.y = 1.24 + (p.y-1.24)*1.14
                p.z += .006
                edited = True
            elif name.startswith(('Apron / side', 'Tasset /')):
                if name.startswith('Apron'):
                    p.x *= 1.10
                p.y = 1.25 + (p.y-1.25)*1.23
                # Keep the extended panels outside the thigh surface.
                p.z += math.copysign(.014*min(1, max(0, (1.25-p.y)/.2)), p.z)
                edited = True
            elif name.startswith('Ear /'):
                sign = -1 if p.x < 0 else 1
                p.x = sign*.23 + (p.x-sign*.23)*1.12
                p.y = 2.50 + (p.y-2.50)*1.20
                edited = True
            elif name.startswith('Hair / sculpted swept hairline'):
                # Lower the rounded cap into the scalp and flatten its crown.
                p.y = 2.75 + (p.y-2.75)*.73
                p.z *= 1.04
                edited = True
            if edited:
                vertex.co = world(p)
        if edited:
            obj.data.update()
            changed.append(name)
        obj['concept_silhouette_pass'] = 2
    return changed


def armor_planes(models, game, world):
    """Flatten forged faces and add the rear overlap visible in the concept."""
    import bpy
    import bmesh
    for obj in list(models):
        if obj.get('concept_armor_planes'):
            continue
        name = obj.name
        if name.startswith('Pauldron / angular front shield'):
            for v in obj.data.vertices:
                p = game(v.co)
                # Compress the bulge toward a sloping plate, retaining its edge.
                plane = .23 + (2.15-p.y)*.17
                p.z = plane + (p.z-plane)*.40
                v.co = world(p)
            for face in obj.data.polygons:
                face.use_smooth = False
        if name.startswith('Apron / rear panel'):
            for v in obj.data.vertices:
                p = game(v.co)
                p.y = 1.24 + (p.y-1.24)*1.15
                v.co = world(p)
        obj.data.update()
        obj['concept_armor_planes'] = True
    if not any(o.name == 'Pauldron / angular rear shield' for o in models):
        originals = [o for o in models if o.name in
                     ('Pauldron / angular front shield', 'Pauldron / worn forged lip')]
        for source in originals:
            obj = source.copy()
            obj.data = source.data.copy()
            obj.name = ('Pauldron / angular rear shield' if 'front shield' in source.name
                        else 'Pauldron / rear forged lip')
            source.users_collection[0].objects.link(obj)
            for v in obj.data.vertices:
                p = game(v.co)
                p.z = -p.z
                v.co = world(p)
            bm = bmesh.new()
            bm.from_mesh(obj.data)
            bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
            bm.to_mesh(obj.data)
            bm.free()
            obj.data.update()
            models.append(obj)


def armor_clearance(models, game, world):
    """Fit the planar shield, border and fasteners clear of the curved shell."""
    for obj in models:
        if obj.get('concept_armor_clearance'):
            continue
        name = obj.name
        if name.startswith(('Pauldron / angular front', 'Pauldron / angular rear')):
            for v in obj.data.vertices:
                p = game(v.co)
                p.z += math.copysign(.042, p.z)
                v.co = world(p)
        elif name in ('Pauldron / worn forged lip', 'Pauldron / rear forged lip'):
            for v in obj.data.vertices:
                p = game(v.co)
                sign = -1 if p.z < 0 else 1
                plane = .30 + (2.15-p.y)*.17
                p.z = sign*(plane + (abs(p.z)-plane)*.40 + .004)
                v.co = world(p)
        elif name.startswith('Pauldron / ivory spike 4'):
            for v in obj.data.vertices:
                p = game(v.co)
                p.z += .060
                v.co = world(p)
        obj.data.update()
    shield = next(o for o in models if o.name == 'Pauldron / angular front shield')
    for obj in models:
        if obj.get('concept_armor_clearance'):
            continue
        if obj.name.startswith('Pauldron / rivet'):
            points = [game(v.co) for v in obj.data.vertices]
            center = sum(points, points[0]*0)/len(points)
            hit, loc, _, _ = shield.ray_cast(world((center.x,center.y,2)),world((0,0,-1)))
            if hit:
                offset = game(loc).z + .009-center.z
                for v,p in zip(obj.data.vertices,points):
                    p.z += offset
                    v.co = world(p)
            obj.data.update()
        obj['concept_armor_clearance'] = True


def fit_hair_strands(models, game, world):
    for obj in models:
        if not obj.name.startswith('Hair / fine swept strand') or obj.get('hair_strand_fit'):
            continue
        if max(game(v.co).y for v in obj.data.vertices)<2.84:
            for v in obj.data.vertices:
                p=game(v.co)
                p.y=2.75+(p.y-2.75)*.73
                p.z*=1.04
                v.co=world(p)
            obj.data.update()
        obj['hair_strand_fit']=True
