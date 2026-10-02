"""Read installed Unity character bundles and export images with an audit manifest."""
import argparse
import gc
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
import UnityPy

PROJECT = Path(__file__).resolve().parents[1]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--game-data', required=True, type=Path)
    parser.add_argument('--config', type=Path, default=PROJECT / 'config/official-art-extraction.json')
    args = parser.parse_args()
    config = json.loads(args.config.read_text(encoding='utf-8-sig'))
    source = args.game_data.resolve()
    bundles = source / config['bundleDirectory']
    files = sorted({file for pattern in config['bundlePatterns'] for file in bundles.glob(pattern) if file.is_file()})
    if not files:
        raise SystemExit('No character bundles found in the selected installation.')
    parent = (PROJECT / config['outputDirectory']).resolve()
    if not parent.is_relative_to(PROJECT / 'data'):
        raise SystemExit('Output must stay inside project/data.')
    output = parent / datetime.now(timezone.utc).strftime('characters-%Y%m%d-%H%M%S-%f')
    output.mkdir(parents=True, exist_ok=False)
    manifest = {'source': str(source), 'unityPyVersion': UnityPy.__version__, 'createdAt': datetime.now(timezone.utc).isoformat(), 'config': config, 'bundles': [], 'images': [], 'textAssets': [], 'errors': []}
    def checkpoint():
        temp = output / 'manifest.tmp'
        temp.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
        temp.replace(output / 'manifest.json')
    for file in files:
        before = len(manifest['images'])
        try:
            env = UnityPy.load(str(file))
            group = output / file.stem
            group.mkdir()
            manifest['bundles'].append({'file': str(file.relative_to(source)), 'sha256': hashlib.sha256(file.read_bytes()).hexdigest()})
            for obj in env.objects:
                if obj.type.name not in config['imageTypes'] and not (config['exportTextAssets'] and obj.type.name == 'TextAsset'):
                    continue
                try:
                    data = obj.read()
                    name = data.m_Name
                    safe_name = re.sub(r'[^a-zA-Z0-9_.-]', '_', name)[:100].strip('.') or 'unnamed'
                    stem = f'{obj.type.name}-{obj.path_id}-{safe_name}'
                    row = {'name': name, 'type': obj.type.name, 'bundle': file.name, 'pathId': obj.path_id}
                    if obj.type.name == 'TextAsset':
                        raw = data.m_Script
                        if isinstance(raw, str):
                            raw = raw.encode('utf-8', 'surrogateescape')
                        target = group / (stem + '.bytes')
                        target.write_bytes(raw)
                        row.update({'file': str(target.relative_to(output)), 'bytes': len(raw)})
                        manifest['textAssets'].append(row)
                    else:
                        image = data.image
                        target = group / (stem + '.png')
                        image.save(target)
                        row.update({'file': str(target.relative_to(output)), 'width': image.width, 'height': image.height, 'mode': image.mode})
                        if obj.type.name == 'Sprite':
                            pivot = getattr(data, 'm_Pivot', None)
                            row['pixelsPerUnit'] = getattr(data, 'm_PixelsToUnits', None)
                            if pivot is not None:
                                row['pivot'] = {'x': pivot.x, 'y': pivot.y}
                        row['sha256'] = hashlib.sha256(target.read_bytes()).hexdigest()
                        manifest['images'].append(row)
                        image.close()
                except Exception as error:
                    manifest['errors'].append({'bundle': file.name, 'pathId': obj.path_id, 'type': obj.type.name, 'error': str(error)[:500]})
            del env
        except Exception as error:
            manifest['errors'].append({'bundle': file.name, 'error': str(error)[:500]})
        gc.collect()
        checkpoint()
        print(f'{file.name}: {len(manifest["images"]) - before} images; errors total {len(manifest["errors"])}', flush=True)
    print(json.dumps({'output': str(output), 'images': len(manifest['images']), 'textAssets': len(manifest['textAssets']), 'errors': len(manifest['errors'])}), flush=True)

if __name__ == '__main__':
    main()
