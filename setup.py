from setuptools import setup, find_packages

with open("requirements.txt") as f:
	install_requires = f.read().strip().split("\n")

# get version from __version__ variable in leetrental/__init__.py
from leetrental import __version__ as version

setup(
	name="leetrental",
	version=version,
	description="",
	author="",
	author_email="",
	packages=find_packages(),
	zip_safe=False,
	include_package_data=True,
	install_requires=install_requires
)
