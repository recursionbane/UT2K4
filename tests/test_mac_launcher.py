import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class MacLauncherTests(unittest.TestCase):
    def check_existing_helper(self, modern_port):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            capture = root / 'opened-url'
            programs = {
                'curl': '''import json,os,sys
url=sys.argv[-1]
modern=':'+os.environ['MOCK_MODERN_PORT']+'/' in url
print(json.dumps({'format':'ut2k4-stream-v1',**({'launcherVersion':1} if modern else {})}))
''',
                'python3': '''import os,sys
if len(sys.argv)>2 and sys.argv[1]=='-c' and 's.bind' in sys.argv[2]:
    sys.exit(1 if sys.argv[-1]=='8789' else 0)
os.execv(sys.executable,[sys.executable,*sys.argv[1:]])
''',
                'open': '''import os,sys
from pathlib import Path
Path(os.environ['OPEN_CAPTURE']).write_text(sys.argv[1])
''',
            }
            for name, text in programs.items():
                file = root / name
                file.write_text('#!'+sys.executable+'\n'+text)
                file.chmod(0o755)
            env = dict(os.environ, PATH=str(root)+os.pathsep+os.environ['PATH'],
                       MOCK_MODERN_PORT=str(modern_port), OPEN_CAPTURE=str(capture))
            result = subprocess.run(['sh', str(ROOT/'tools/play-on-mac.command')],
                                    env=env,capture_output=True,text=True,timeout=10)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertEqual(capture.read_text(),
                f'http://127.0.0.1:{modern_port}/play/?source=http%3A%2F%2F127.0.0.1%3A{modern_port}%2Fmanifest.json')
            return result.stdout

    def test_reuse_current_helper_same_origin(self):
        self.assertNotIn('previous helper',self.check_existing_helper(8789))

    def test_older_helper_keeps_running_and_reuses_updated_neighbor(self):
        self.assertIn('previous helper',self.check_existing_helper(8790))


if __name__=='__main__':
    unittest.main()
