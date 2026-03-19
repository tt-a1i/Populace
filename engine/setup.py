from setuptools import find_packages, setup


setup(
    name="populace-engine",
    version="0.1.0",
    description="AI town simulation engine inspired by Stanford Generative Agents",
    python_requires=">=3.11",
    packages=find_packages(where="..", include=["engine"]),
    package_dir={"": ".."},
)
