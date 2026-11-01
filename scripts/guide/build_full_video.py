#!/usr/bin/env python3
"""Join the narrated clips of the guide into one full demo video per language.

usage: build_full_video.py SITE_DIR [--check] [--out DIR]

Reads SITE_DIR/assets/video/full/manifest.json:
  {"languages": {"en": {"label": "English", "audio_lang": "eng",
                        "clips": [{"src": "full/open-en.mp4", "title": "Opening"},
                                  {"src": "step-01.mp4", "title": "Step 1: Get the code"}, ...]}, ...}}
Clip paths are relative to SITE_DIR/assets/video. Writes, next to the clips (or into --out):
  full-<lang>.mp4     video stream-copied from the clips (no quality loss), one continuous AAC track, MP4 chapters
  full-<lang>.vtt     the clips' subtitles shifted onto the full timeline
  full-<lang>.json    chapter start times and the total duration
  full-<lang>.sha256  hash of the inputs; a language is rebuilt only when its inputs change
--check exits 1 when any language needs a rebuild (used by the publish workflow to skip installing ffmpeg).
"""
import hashlib, json, os, re, shutil, subprocess, sys, tempfile


def ffmpeg_exe():
    exe = os.environ.get('FFMPEG') or shutil.which('ffmpeg')
    if exe:
        return exe
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        sys.exit('ffmpeg not found (install ffmpeg or set FFMPEG)')


def inputs_hash(entry, base):
    h = hashlib.sha256(json.dumps(entry, sort_keys=True).encode())
    for c in entry['clips']:
        for p in (c['src'], os.path.splitext(c['src'])[0] + '.vtt'):
            fp = os.path.join(base, p)
            if os.path.exists(fp):
                h.update(p.encode())
                with open(fp, 'rb') as f:
                    h.update(hashlib.sha256(f.read()).digest())
    return h.hexdigest()


def video_duration(ff, path):
    """Exact video duration from the frame count (stream copy, no decoding) and the frame rate."""
    r = subprocess.run([ff, '-hide_banner', '-i', path, '-map', '0:v:0', '-c', 'copy', '-f', 'framecrc', '-'],
                       capture_output=True, text=True)
    frames = sum(1 for l in r.stdout.splitlines() if l.strip() and not l.startswith('#'))
    fps = re.search(r'(\d+(?:\.\d+)?) fps', r.stderr)
    if not frames or not fps:
        raise RuntimeError(f'cannot read {path}: {r.stderr[-400:]}')
    return frames / float(fps.group(1))


def parse_vtt(path):
    cues = []
    if not os.path.exists(path):
        return cues
    blocks = open(path, encoding='utf-8').read().replace('\r', '').split('\n\n')
    for b in blocks:
        lines = [l for l in b.split('\n') if l.strip()]
        for i, l in enumerate(lines):
            m = re.match(r'(\d+):(\d+):(\d+)\.(\d+)\s+-->\s+(\d+):(\d+):(\d+)\.(\d+)', l)
            if m:
                g = [int(x) for x in m.groups()]
                a = g[0] * 3600 + g[1] * 60 + g[2] + g[3] / 1000
                z = g[4] * 3600 + g[5] * 60 + g[6] + g[7] / 1000
                cues.append((a, z, '\n'.join(lines[i + 1:])))
                break
    return cues


def ts(t):
    ms = int(round(t * 1000))
    return f'{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d}.{ms % 1000:03d}'


def build(ff, lang, entry, base, out_dir):
    clips = [os.path.join(base, c['src']) for c in entry['clips']]
    missing = [c for c in clips if not os.path.exists(c)]
    if missing:
        raise SystemExit(f'{lang}: missing clips {missing}')
    durs = [video_duration(ff, c) for c in clips]
    starts, acc = [], 0.0
    for d in durs:
        starts.append(acc); acc += d
    total = acc
    work = tempfile.mkdtemp(prefix=f'full-{lang}-')
    try:
        # one continuous audio track: each clip's narration padded or trimmed to its exact video length
        args = [ff, '-y', '-hide_banner', '-loglevel', 'error']
        for c in clips:
            args += ['-i', c]
        graph = ';'.join(f'[{i}:a]aresample=24000,apad=whole_dur={d:.6f},atrim=end={d:.6f},asetpts=PTS-STARTPTS[a{i}]'
                         for i, d in enumerate(durs))
        graph += ';' + ''.join(f'[a{i}]' for i in range(len(clips))) + f'concat=n={len(clips)}:v=0:a=1[aout]'
        audio = os.path.join(work, 'audio.m4a')
        subprocess.run(args + ['-filter_complex', graph, '-map', '[aout]', '-c:a', 'aac', '-b:a', '64k', '-ac', '1', audio], check=True)
        # video: concat demuxer, stream copy
        lst = os.path.join(work, 'clips.txt')
        with open(lst, 'w') as f:
            for c, d in zip(clips, durs):
                # an explicit duration keeps every clip's offset frame-exact (audio is rebuilt separately)
                f.write("file '" + os.path.abspath(c).replace("'", "'\\''") + "'\n" + f'duration {d:.6f}\n')
        meta = os.path.join(work, 'chapters.txt')
        with open(meta, 'w', encoding='utf-8') as f:
            f.write(';FFMETADATA1\n')
            f.write(f"title=Contoso Health on AKS - full demo ({entry.get('label', lang)})\n")
            for c, a, d in zip(entry['clips'], starts, durs):
                title = c.get('title', '').replace('=', '-').replace(';', ',').replace('#', '').replace('\n', ' ')
                f.write(f'[CHAPTER]\nTIMEBASE=1/1000\nSTART={int(a * 1000)}\nEND={int((a + d) * 1000)}\ntitle={title}\n')
        out = os.path.join(out_dir, f'full-{lang}.mp4')
        tmp_out = os.path.join(work, 'full.mp4')
        subprocess.run([ff, '-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-i', audio, '-i', meta,
                        '-map', '0:v:0', '-map', '1:a:0', '-map_metadata', '2', '-map_chapters', '2', '-c', 'copy',
                        '-metadata:s:a:0', f"language={entry.get('audio_lang', 'und')}", '-movflags', '+faststart', tmp_out], check=True)
        shutil.move(tmp_out, out)
    finally:
        shutil.rmtree(work, ignore_errors=True)
    # subtitles on the full timeline
    lines = ['WEBVTT', '']
    for c, a in zip(entry['clips'], starts):
        for s, e, text in parse_vtt(os.path.join(base, os.path.splitext(c['src'])[0] + '.vtt')):
            lines += [f'{ts(a + s)} --> {ts(a + e)}', text, '']
    with open(os.path.join(out_dir, f'full-{lang}.vtt'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    info = {'lang': lang, 'duration': round(total, 3),
            'chapters': [{'t': round(a, 3), 'title': c.get('title', '')} for c, a in zip(entry['clips'], starts)]}
    with open(os.path.join(out_dir, f'full-{lang}.json'), 'w', encoding='utf-8') as f:
        json.dump(info, f, ensure_ascii=False, indent=1)
    print(f'{lang}: {out} {total / 60:.1f} min, {os.path.getsize(out) / 1e6:.1f} MB, {len(clips)} clips')
    return info


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    site = sys.argv[1]
    check = '--check' in sys.argv
    out_dir = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else None
    base = os.path.join(site, 'assets', 'video')
    man_path = os.path.join(base, 'full', 'manifest.json')
    if not os.path.exists(man_path):
        print('no full-video manifest; nothing to do')
        return 0
    manifest = json.load(open(man_path, encoding='utf-8'))
    out_dir = out_dir or base
    os.makedirs(out_dir, exist_ok=True)
    stale = []
    for lang, entry in manifest['languages'].items():
        h = inputs_hash(entry, base)
        stamp = os.path.join(out_dir, f'full-{lang}.sha256')
        current = open(stamp).read().strip() if os.path.exists(stamp) else ''
        if current != h or not os.path.exists(os.path.join(out_dir, f'full-{lang}.mp4')):
            stale.append((lang, entry, h, stamp))
    if check:
        print('stale:', [s[0] for s in stale] or 'none')
        return 1 if stale else 0
    if not stale:
        print('full videos are up to date')
        return 0
    ff = ffmpeg_exe()
    for lang, entry, h, stamp in stale:
        build(ff, lang, entry, base, out_dir)
        with open(stamp, 'w') as f:
            f.write(h + '\n')
    return 0


if __name__ == '__main__':
    sys.exit(main())
