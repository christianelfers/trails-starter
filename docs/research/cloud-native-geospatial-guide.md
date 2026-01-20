# Cloud-Native Geospatial Data Guide

> Formats, Data Sources, Implementation & Infrastructure
>
> Comprehensive documentation based on [guide.cloudnativegeo.org](https://guide.cloudnativegeo.org/) and [docs.overturemaps.org](https://docs.overturemaps.org/)
> License: Creative Commons Attribution 4.0 International
> Citation: Barciauskas, A et al. 2023. Cloud Optimized Geospatial Formats Guide. CC-By-4.0

---

## Table of Contents

1. [Introduction](#introduction)
2. [Core Concepts](#core-concepts)
3. [Deep Dive: How Cloud-Native Actually Works](#deep-dive-how-cloud-native-actually-works)
4. [Cloud-Optimized GeoTIFFs (COG)](#cloud-optimized-geotiffs-cog)
5. [Zarr](#zarr)
6. [Kerchunk](#kerchunk)
7. [Cloud-Optimized HDF5/NetCDF](#cloud-optimized-hdf5netcdf)
8. [Cloud-Optimized Point Clouds (COPC)](#cloud-optimized-point-clouds-copc)
9. [GeoParquet](#geoparquet)
10. [FlatGeobuf](#flatgeobuf)
11. [PMTiles](#pmtiles)
12. [Zarr + STAC Integration](#zarr--stac-integration)
13. [Overture Maps](#overture-maps)
14. [Format Selection Guide](#format-selection-guide)
15. [Implementation Guide](#implementation-guide)
16. [Infrastructure Setup](#infrastructure-setup)
17. [Complete Working Examples](#complete-working-examples)
18. [Glossary](#glossary)

---

## Introduction

The Cloud-Optimized Geospatial Formats Guide addresses the landscape of cloud-optimized geospatial formats and provides best-known answers to common questions about efficiently accessing geospatial data in cloud environments.

**The Core Challenge**: There is no one-size-fits-all approach. Data processing varies significantly across raster, vector, and point cloud types, requiring different optimization strategies for different use cases.

### What Makes a Format "Cloud-Optimized"?

Cloud-optimized formats enable two critical capabilities:

1. **Partial Reads**: Access specific data subsets without downloading entire files
2. **Parallel Reads**: Concurrent data access for improved performance

### Essential Characteristics

Effective cloud-optimized files feature:

- Metadata retrievable in a single read, enabling concurrent data operations
- Small addressable chunks through internal tiles or file organization
- HTTP range request compatibility for object storage systems
- Support for lazy access and intelligent subsetting
- Integration with distributed analysis frameworks

---

## Core Concepts

### Format Categories by Data Type

| Data Type                   | Cloud-Optimized Formats         | Standards Status                          |
| --------------------------- | ------------------------------- | ----------------------------------------- |
| **Raster (2D)**             | Cloud-Optimized GeoTIFF (COG)   | OGC standard under review, widely adopted |
| **Multidimensional Arrays** | Zarr, Kerchunk, Icechunk        | Standards in development                  |
| **Point Clouds**            | COPC, Entwine Point Tiles (EPT) | Less standardized                         |
| **Vector Data**             | GeoParquet, FlatGeobuf          | Draft OGC standards                       |
| **Tiled Data**              | PMTiles                         | Community standard                        |

### HTTP Range Requests

The foundation of cloud-optimized formats is the HTTP Range Request specification, which allows clients to request specific byte ranges from files instead of downloading entire files. This enables:

- Fetching only necessary data chunks
- Parallel downloads of different file sections
- Efficient access from object storage (S3, GCS, Azure Blob)

### Chunking

All cloud-optimized formats use some form of chunking - dividing data into smaller, independently addressable units. The optimal chunk size balances:

- **Too Small**: More metadata overhead, more HTTP requests
- **Too Large**: Download more data than needed, higher memory usage

Typical recommendation: 100KB - 16MB per chunk, with 1MB being a good starting point.

---

## Deep Dive: How Cloud-Native Actually Works

This section explains the actual mechanics of how cloud-optimized formats enable efficient remote access. Understanding these internals helps you make informed decisions about format selection and optimization.

### The Fundamental Problem

Traditional file formats were designed for local disk access where:

- Seeking to any byte position is essentially free (~0.1ms for SSD)
- Reading sequential data is fast
- The entire file is always available

Cloud storage (S3, Azure Blob, GCS) changes everything:

- Each HTTP request has **latency overhead** (50-200ms round-trip)
- You pay for **data transfer** (egress costs)
- Files may be **gigabytes to terabytes** in size

**The goal**: Minimize the number of HTTP requests while fetching only the data you need.

### HTTP Range Requests: The Foundation

All cloud-optimized formats rely on HTTP Range Requests (RFC 7233):

```http
GET /data/file.parquet HTTP/1.1
Host: bucket.s3.amazonaws.com
Range: bytes=1000-1999
```

Response:

```http
HTTP/1.1 206 Partial Content
Content-Range: bytes 1000-1999/50000000
Content-Length: 1000

[1000 bytes of data]
```

**Key insight**: The client must know _which_ bytes to request. This requires:

1. A way to discover the file's internal structure
2. Metadata that maps "what I want" to "byte ranges"

### How Each Format Solves This

#### COG: IFD-First Layout

**Traditional GeoTIFF problem**: Metadata (IFDs) can be anywhere in the file, requiring multiple round-trips to discover tile locations.

**COG solution**: Strict byte ordering with metadata at the front.

```
┌─────────────────────────────────────────────────────────────┐
│ Bytes 0-7: TIFF Header + pointer to first IFD               │
├─────────────────────────────────────────────────────────────┤
│ Bytes 8-~100: Ghost Area (ASCII metadata)                   │
│   LAYOUT=IFDS_BEFORE_DATA                                   │
│   BLOCK_ORDER=ROW_MAJOR                                     │
├─────────────────────────────────────────────────────────────┤
│ IFD 0 (full resolution): tile offsets + byte counts         │
│ IFD 1 (overview 1): tile offsets + byte counts              │
│ IFD 2 (overview 2): tile offsets + byte counts              │
├─────────────────────────────────────────────────────────────┤
│ Tile data (bulk of file)                                    │
│   Tile[0,0], Tile[0,1], Tile[0,2], ...                      │
└─────────────────────────────────────────────────────────────┘
```

**Request flow** (reading a 256x256 window from a 10GB COG):

1. **Request 1**: Fetch first 16KB → Gets all IFDs + tile index
2. **Parse**: IFD tells us tile (5,3) is at byte offset 45,234,567, length 32,456
3. **Request 2**: Fetch bytes 45,234,567-45,267,022 → Get compressed tile
4. **Decompress**: LZW/Deflate/JPEG decode locally

**Total**: 2 HTTP requests for any spatial subset, regardless of file size.

#### Parquet/GeoParquet: Footer-First Layout

**Structure**:

```
┌─────────────────────────────────────────────────────────────┐
│ Row Group 0                                                 │
│   Column Chunk: geometry (bytes 0-1,234,567)                │
│   Column Chunk: name (bytes 1,234,568-1,345,678)            │
│   Column Chunk: population (bytes 1,345,679-1,400,000)      │
├─────────────────────────────────────────────────────────────┤
│ Row Group 1                                                 │
│   Column Chunk: geometry (bytes 1,400,001-2,634,567)        │
│   ...                                                       │
├─────────────────────────────────────────────────────────────┤
│ ...more row groups...                                       │
├─────────────────────────────────────────────────────────────┤
│ Footer (last ~10KB)                                         │
│   - Row group locations                                     │
│   - Column chunk byte offsets                               │
│   - Per-column statistics (min/max/null_count)              │
│   - Schema                                                  │
├─────────────────────────────────────────────────────────────┤
│ Footer length (4 bytes) + "PAR1" magic (4 bytes)            │
└─────────────────────────────────────────────────────────────┘
```

**Request flow** (query: `SELECT name FROM places WHERE population > 1000000`):

1. **Request 1**: Fetch last 8 bytes → Footer length
2. **Request 2**: Fetch footer (last N bytes) → All metadata
3. **Parse**: Footer contains:
    - Row group 0: population min=500, max=50000 → **SKIP** (no matching rows)
    - Row group 1: population min=100000, max=5000000 → **NEED**
    - Row group 1, column "name": bytes 2,634,568-2,700,000
4. **Request 3**: Fetch bytes 2,634,568-2,700,000 → Only the "name" column of row group 1

**Key insight**: Statistics in the footer enable **predicate pushdown** - skipping entire row groups without reading them.

#### GeoParquet bbox Filtering

GeoParquet adds a `bbox` column with per-row bounding boxes:

```
┌──────────────────────────────────────────────────────────┐
│ Row Group 0                                              │
│   bbox column statistics: xmin=-122.5, xmax=-122.0, ...  │
│   geometry column: [WKB bytes]                           │
├──────────────────────────────────────────────────────────┤
│ Row Group 1                                              │
│   bbox column statistics: xmin=-74.1, xmax=-73.9, ...    │
│   geometry column: [WKB bytes]                           │
└──────────────────────────────────────────────────────────┘
```

**Spatial query flow** (bbox = [-74.0, 40.7, -73.9, 40.8]):

1. Read footer → Get bbox column statistics per row group
2. Row group 0: bbox.xmax=-122.0 < query.xmin=-74.0 → **SKIP** (no overlap)
3. Row group 1: bbox overlaps query → **NEED**
4. Fetch only row group 1's geometry column

**Limitation**: This is **coarse filtering** at row-group level (typically 50K-100K rows). You still download all geometries in matching row groups, then filter client-side.

#### FlatGeobuf: Hilbert R-Tree Index

**Structure**:

```
┌─────────────────────────────────────────────────────────────┐
│ Magic bytes (8 bytes): 0x6667620366676201                   │
├─────────────────────────────────────────────────────────────┤
│ Header (variable): schema, CRS, feature count, bbox         │
├─────────────────────────────────────────────────────────────┤
│ Spatial Index (Packed Hilbert R-Tree)                       │
│   Level 0 (root): 1 node covering entire extent             │
│   Level 1: 16 nodes                                         │
│   Level 2: 256 nodes                                        │
│   ...                                                       │
│   Leaf level: N nodes, each containing:                     │
│     - Bounding box (minX, minY, maxX, maxY)                 │
│     - Byte offset to feature in data section                │
├─────────────────────────────────────────────────────────────┤
│ Feature Data (sorted by Hilbert curve)                      │
│   Feature 0: [geometry + properties as FlatBuffer]          │
│   Feature 1: [geometry + properties as FlatBuffer]          │
│   ...                                                       │
└─────────────────────────────────────────────────────────────┘
```

**Hilbert curve ordering**: Features are sorted by their position on a Hilbert space-filling curve. This ensures spatially nearby features are stored contiguously in the file.

```
Traditional ordering:        Hilbert ordering:
1  2  3  4                   1  2  15 16
5  6  7  8         →         4  3  14 13
9  10 11 12                  5  8  9  12
13 14 15 16                  6  7  10 11
```

**Spatial query flow** (bbox = small region):

1. **Request 1**: Fetch header → Get index size and structure
2. **Request 2**: Fetch R-tree root node
3. **Traverse**: Check which child nodes intersect query bbox
4. **Requests 3-N**: Fetch only intersecting nodes until reaching leaves
5. **Leaf nodes**: Contain byte offsets to actual features
6. **Final requests**: Fetch features at those byte offsets

**Key advantage**: True spatial indexing means only ~O(log N) + matching features are fetched, not entire row groups.

**Key disadvantage**: Many small HTTP requests. For a query returning 1000 features, you might make 50+ requests.

### Request Patterns Compared

| Format         | Discovery Requests     | Data Requests          | Best For                |
| -------------- | ---------------------- | ---------------------- | ----------------------- |
| **COG**        | 1 (16KB)               | 1 per tile needed      | Raster windows          |
| **GeoParquet** | 2 (footer)             | 1 per row group needed | Column scans, analytics |
| **FlatGeobuf** | 2-10 (index traversal) | 1 per feature batch    | Precise spatial queries |
| **Zarr**       | 1-2 (.zmetadata)       | 1 per chunk needed     | Array slicing           |

### When Cloud-Optimized Actually Helps

**Cloud-optimized wins when**:

- File is large (>100MB) and you need a small subset
- Network latency is high (cross-region, internet)
- You're paying for egress
- Multiple users access different parts of the same file

**Just download the file when**:

- File is small (<50MB)
- You need most or all of the data
- Local processing is the bottleneck
- You'll access it many times

### Network Cost Analysis

**Example**: 1GB GeoParquet file, query returns 1% of data

| Approach        | Data Transfer | Requests | Time (100ms latency)   |
| --------------- | ------------- | -------- | ---------------------- |
| Download all    | 1GB           | 1        | 1GB/bandwidth + 100ms  |
| Cloud-optimized | ~10MB         | ~5       | 10MB/bandwidth + 500ms |

**Break-even point**: Cloud-optimized wins when subset_size < total_size × (1 - request_overhead/download_time)

### Practical Optimization Tips

1. **Chunk/Row Group Sizing**:
    - Larger = fewer requests, more over-fetching
    - Smaller = more requests, less over-fetching
    - Sweet spot: 1-16MB depending on typical query patterns

2. **Predicate Pushdown**:
    - Add columns specifically for filtering (bbox, timestamp, category)
    - Ensure statistics are computed (not all writers do this)

3. **CDN Configuration**:
    - Enable CORS for browser access
    - Cache OPTIONS requests (preflight)
    - Enable range request support (most CDNs do by default)

4. **Client Configuration**:
    - Use connection pooling (reuse TCP connections)
    - Enable HTTP/2 for multiplexed requests
    - Configure appropriate timeouts

---

## Cloud-Optimized GeoTIFFs (COG)

### Overview

Cloud-Optimized GeoTIFF (COG) is a variant of the TIFF image format that specifies a particular layout of internal data to allow for optimized (subsetted or aggregated) access over a network.

**Key Distinction**: All COGs are valid GeoTIFF files, but not all GeoTIFFs are valid COGs.

### Core Components

#### 1. Internal Blocks (Tiles)

- **Required** when image dimensions exceed 512×512 pixels
- Recommended sizes: **256×256** or **512×512** pixels
- Smaller blocks = fewer unnecessary bytes downloaded, but more read operations
- Larger blocks = optimized aggregate access, less precision

#### 2. Overviews (Pyramids)

Downsampled representations for visualization at different zoom levels:

```
Level 0: Full resolution (7200×3600)
Level 1: 2x decimation (3600×1800)
Level 2: 4x decimation (1800×900)
Level 3: 8x decimation (900×450)
```

The smallest overview should approximate 256×256 dimensions.

#### 3. Compression

| Type            | Codec        | Use Case                                   |
| --------------- | ------------ | ------------------------------------------ |
| **Lossless**    | Deflate, LZW | General use, preserves exact values        |
| **Lossy**       | JPEG         | Visualization-only RGB byte data           |
| **Specialized** | LERC         | Floating-point data with precision control |

**Best Practice**: Use the smallest possible data type that still represents the data appropriately. All bands must share the same data type.

### Overview Resampling Methods

Different resampling methods for different data types:

| Method     | Description                 | Best For                    |
| ---------- | --------------------------- | --------------------------- |
| `nearest`  | Preserves exact values      | Categorical/classified data |
| `average`  | Mean of contributing pixels | Continuous data             |
| `mode`     | Most frequent value         | Categorical data            |
| `bilinear` | Linear interpolation        | Smooth continuous data      |
| `cubic`    | Cubic convolution           | High-quality imagery        |
| `lanczos`  | Lanczos filtering           | Highest quality resampling  |
| `sum`      | Sum of pixel values         | Count data                  |
| `rms`      | Root mean square            | Statistical data            |

### Accessing COGs in Python

#### Basic Setup

```python
import rasterio
from rasterio.windows import Window, from_bounds
from rasterio.session import AWSSession
import boto3

# For public S3 data
aws_session = AWSSession(boto3.Session(), aws_unsigned=True)

with rasterio.Env(aws_session):
    with rasterio.open(cog_url) as dataset:
        # Read metadata (minimal download)
        print(f"Bounds: {dataset.bounds}")
        print(f"Resolution: {dataset.res}")
        print(f"Block shapes: {dataset.block_shapes}")
        print(f"Overviews: {dataset.overviews(1)}")

        # Read specific window
        window = Window(col_off=0, row_off=0, width=512, height=512)
        data = dataset.read(1, window=window)

        # Read by geographic bounds
        window = from_bounds(left, bottom, right, top, dataset.transform)
        data = dataset.read(1, window=window)
```

#### Reading Overviews

```python
# Read from a specific overview level
with rasterio.open(cog_url, overview_level=2) as dataset:
    data = dataset.read(1)  # Returns data at 1/4 resolution
```

### Writing COGs in Python

```python
from rio_cogeo.cogeo import cog_translate, cog_validate
from rio_cogeo.profiles import cog_profiles
from rasterio.io import MemoryFile

# Validate existing file
is_valid, errors, warnings = cog_validate("input.tif")

# Create COG with recommended settings
with MemoryFile() as memfile:
    with memfile.open(**src_profile) as mem:
        mem.write(array)

        # Get compression profile
        dst_profile = cog_profiles.get("deflate")

        # Translate to COG
        cog_translate(
            mem,
            "output.tif",
            dst_profile,
            use_cog_driver=True
        )
```

**Recommended Compression Settings**:

- WEBP for RGB/RGBA datasets (supports lossless)
- Deflate with `PREDICTOR=2` and `ZLEVEL=9` for non-byte data

### Accessing COGs in R

#### Using terra

```r
library(terra)

# Configure for public S3 access
setGDALconfig("AWS_NO_SIGN_REQUEST", "YES")
setGDALconfig("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")

# Open COG (metadata only, no data download)
cog_url <- "/vsis3/bucket/path/file.tif"
r <- rast(cog_url)

# Read specific extent
crop_extent <- ext(xmin, xmax, ymin, ymax)
cropped_data <- crop(r, crop_extent)

# Plot using overviews
plot(r, overview = TRUE)
```

#### Using stars

```r
library(stars)

# Configure environment
Sys.setenv(AWS_NO_SIGN_REQUEST = "YES")
Sys.setenv(GDAL_DISABLE_READDIR_ON_OPEN = "EMPTY_DIR")

# Open as proxy (lazy loading)
r <- read_stars(cog_url, proxy = TRUE)

# Read specific region
rasterio <- list(nXOff = 1, nYOff = 1, nXSize = 1024, nYSize = 1024)
data <- read_stars(cog_url, RasterIO = rasterio)
```

### Web-Optimized COGs

For web mapping applications, create COGs aligned to Web Mercator tiles:

```bash
rio cogeo create input.tif output.tif --web-optimized
```

Or with GDAL:

```
TILING_SCHEME=GoogleMapsCompatible
```

---

## Zarr

### Overview

Zarr is a format designed for storing chunked, compressed, N-dimensional arrays. It's optimized for data that is too large for local machines, organizing data so users can retrieve just the portions they need.

### Core Concepts

#### Structure

```
my_dataset.zarr/
├── .zgroup                 # Group metadata
├── .zattrs                 # Group attributes
├── temperature/
│   ├── .zarray            # Array metadata (shape, chunks, dtype)
│   ├── .zattrs            # Array attributes
│   ├── 0.0.0              # Chunk files
│   ├── 0.0.1
│   └── ...
└── pressure/
    ├── .zarray
    └── ...
```

#### Key Features

- **Chunked Storage**: Arrays divided into regularly-sized blocks
- **Compression**: Each chunk individually compressed
- **Hierarchical**: Groups can contain arrays or other groups
- **Multiple Backends**: Memory, local disk, S3, GCS, Azure

### Zarr Version 3

Major changes from Version 2:

- Renamed conventions (`dtype` → `data_type`)
- Codec consolidation
- **Sharding**: Multiple chunks within single storage objects (reduces file count)

### Creating Zarr Stores

```python
import zarr
import numpy as np

# Local store
store = zarr.storage.LocalStore("data.zarr")
arr = zarr.create_array(
    store=store,
    data=np.arange(10000000),
    chunks=(500000,),  # ~1MB chunks recommended
    compressors=zarr.codecs.BloscCodec(cname='lz4', clevel=5)
)

# Hierarchical groups
root = zarr.create_group(store)
temp = root.create_group('temperature')
temp.create_array(
    name='surface',
    shape=(1000, 1000, 365),
    chunks=(100, 100, 30),
    dtype='f4'
)
```

### Metadata Consolidation

Essential for cloud performance - reduces metadata requests:

```python
zarr.consolidate_metadata(store)

# Open with consolidated metadata
ds = zarr.open(store, use_consolidated=True)
```

### Accessing Remote Zarr Data

```python
import xarray as xr

# Direct HTTPS access
url = 'https://example.com/data.zarr'
ds = xr.open_dataset(
    url,
    engine='zarr',
    chunks='auto',
    consolidated=True
)

# S3 access
import s3fs
fs = s3fs.S3FileSystem(anon=True)
store = s3fs.S3Map(root='bucket/data.zarr', s3=fs)
ds = xr.open_zarr(store)
```

### Compression Options

```python
# Blosc (fast, good compression)
zarr.codecs.BloscCodec(cname='lz4', clevel=5, shuffle='shuffle')

# Gzip (widely compatible)
zarr.codecs.GzipCodec(level=6)

# Zstd (excellent ratio/speed)
zarr.codecs.ZstdCodec(level=3)
```

### Limitations

- Not designed for vector data, point clouds, or sparse data
- Immutable once written (no append)
- Requires careful chunk size planning

---

## Kerchunk

### Overview

Kerchunk creates reference files that enable cloud-optimized access to traditional formats (NetCDF, HDF5, GRIB2, TIFF) without data duplication. It generates Zarr-compatible metadata pointing to byte ranges in original files.

### How It Works

Reference files are JSON documents mapping Zarr metadata paths to either:

- Raw data values (small data)
- File URL + byte offset + length (large data)

```json
{
    "version": 1,
    "refs": {
        ".zgroup": "{\"zarr_format\": 2}",
        "temperature/.zarray": "{\"chunks\": [100, 100], ...}",
        "temperature/0.0": ["s3://bucket/file.nc", 294094376, 73825960]
    }
}
```

### Creating Kerchunk References

#### Single File

```python
import kerchunk.hdf
import fsspec
import ujson

# Open source file
fs = fsspec.filesystem('s3', anon=True)
with fs.open('s3://bucket/file.nc') as f:
    h5chunks = kerchunk.hdf.SingleHdf5ToZarr(f, url='s3://bucket/file.nc')
    refs = h5chunks.translate()

# Save reference file
with open('reference.json', 'w') as f:
    ujson.dump(refs, f)
```

#### Multiple Files

```python
from kerchunk.combine import MultiZarrToZarr

# Combine multiple reference files
mzz = MultiZarrToZarr(
    reference_files,
    concat_dims=['time'],
    coo_map={'time': 'cf:time'}
)
combined_refs = mzz.translate()
```

### Reading Kerchunk References

```python
import xarray as xr
import fsspec

# Via fsspec
fs = fsspec.filesystem(
    'reference',
    fo='reference.json',
    remote_protocol='s3',
    remote_options={'anon': True}
)
ds = xr.open_dataset(
    fs.get_mapper(''),
    engine='zarr',
    backend_kwargs={'consolidated': False}
)
```

### Limitations

- Chunk sizes bound to original file structure
- NetCDF works well; complex HDF5 hierarchies may have issues
- Requires reference file updates if source files move

---

## Cloud-Optimized HDF5/NetCDF

### The Challenge

Traditional HDF5/NetCDF files scatter metadata throughout the file, requiring multiple network requests to access specific data chunks in cloud environments.

### Optimization Strategies

#### 1. Consolidated Metadata

Use paged aggregation file space management:

```bash
# Check current status
h5stat -S infile.h5

# Apply PAGE strategy
h5repack -S PAGE -G 4000000 infile.h5 outfile.h5
```

Page size should exceed total metadata size (check with h5stat).

#### 2. Optimal Chunk Sizing

**Target Range**: 100KB - 16MB per chunk

| Issue  | Too Small                           | Too Large                                    |
| ------ | ----------------------------------- | -------------------------------------------- |
| Impact | Extra metadata, more I/O operations | Must decompress entire chunk for small reads |

```bash
# Check chunk configuration
h5dump -pH file.h5 | grep dataset -A 10

# Change chunk size
h5repack /path/dataset:CHUNK=2000 infile.h5 outfile.h5
```

#### 3. Chunk Shape Considerations

For 3D data (lat, lon, time):

- **Time-series analysis**: Larger time dimension
- **Mapping/spatial**: Larger spatial dimensions

### Format Compatibility

| Format      | Chunking | Compression | Cloud-Optimizable |
| ----------- | -------- | ----------- | ----------------- |
| NetCDF-4    | ✓        | ✓           | Yes               |
| HDF5        | ✓        | ✓           | Yes               |
| NetCDF-3    | ✗        | ✗           | No                |
| HDF4 (<4.1) | ✗        | ✗           | No                |

### Library Configuration

```python
import h5py

# Increase chunk cache (default 1MB)
f = h5py.File('data.h5', 'r', rdcc_nbytes=10*1024*1024)

# Configure page buffer
f = h5py.File('data.h5', 'r', page_buf_size=4*1024*1024)
```

### Cloud-Optimized HDF/NetCDF Checklist

- [ ] Format supports consolidated metadata, chunking, compression
- [ ] Metadata has been consolidated (PAGE strategy)
- [ ] Chunk sizes within 100KB-16MB range
- [ ] Appropriate compression applied
- [ ] Chunk shape matches expected access patterns
- [ ] Documentation includes cloud access guidance

---

## Cloud-Optimized Point Clouds (COPC)

### Overview

COPC (Cloud-Optimized Point Cloud) is a cloud-optimized format for 3D point cloud data. A COPC file is a valid LAZ file with additional structure for efficient cloud access.

**Key Relationship**: COPC : LAZ :: COG : GeoTIFF

### Structure

COPC files organize point data into a **clustered octree** rather than regular grids:

```
         Root Node (entire extent)
        /    |    \    \
    Node  Node  Node  Node (8 children per level)
     /\    /\    /\    /\
   ...   ...   ...   ... (progressively finer detail)
```

### Key Features

- Valid LAZ file (readable by any LAZ-compatible software)
- Variable-length records (VLRs) describe octree structure
- Supports partial decompression through chunking
- Hierarchical LOD (Level of Detail) for visualization

### Converting LAS to COPC

Using PDAL (Point Data Abstraction Library):

```python
import pdal

# Define pipeline
pipeline = pdal.Reader.las(filename="input.las") | \
           pdal.Writer.copc(filename="output.copc.laz")

# Execute
count = pipeline.execute()
print(f"Processed {count} points")
```

```bash
# Command line
pdal translate input.las output.copc.laz --writer copc
```

### Validation

```python
import pdal

pipeline = pdal.Reader.copc(filename="output.copc.laz")
pipeline.execute()

# Check metadata
metadata = pipeline.metadata
print(f"Is COPC: {metadata['metadata']['readers.copc']['copc']}")
```

### File Size Comparison

Typical compression ratios:

- LAS → LAZ: ~60-70% reduction
- LAZ → COPC: Similar size to LAZ (reorganized, not additionally compressed)

Example: 91MB LAS → 26MB COPC.LAZ

---

## GeoParquet

### Overview

GeoParquet is an encoding for storing geospatial vector data (points, lines, polygons) in Apache Parquet format. It reached version 1.0 in September 2023.

### Key Benefits

| Feature              | Benefit                                            |
| -------------------- | -------------------------------------------------- |
| **Columnar Storage** | Fetch specific columns without loading entire rows |
| **Row Groups**       | Skip data chunks that don't match filters          |
| **Compression**      | Column-oriented data compresses efficiently        |
| **Random Access**    | Access specific chunks without full download       |
| **Metadata Footer**  | Efficient cloud-based access patterns              |

### File Structure

```
┌─────────────────────────────────────┐
│ Row Group 1                         │
│  ├── Column: geometry (WKB)         │
│  ├── Column: name                   │
│  └── Column: population             │
├─────────────────────────────────────┤
│ Row Group 2                         │
│  └── ...                            │
├─────────────────────────────────────┤
│ Footer (metadata, schema, geo info) │
└─────────────────────────────────────┘
```

### Geometry Encoding

- Stored as ISO-standard **Well-Known Binary (WKB)**
- Supports all OGC Simple Features types
- CRS information encoded in file metadata

### Reading GeoParquet

```python
import geopandas as gpd

# Local file
gdf = gpd.read_parquet("data.parquet")

# Remote file with column selection
from fsspec.implementations.http import HTTPFileSystem
fs = HTTPFileSystem()
gdf = gpd.read_parquet(
    url,
    columns=["geometry", "name", "population"],
    filesystem=fs
)

# Process large files in chunks
import pyarrow.parquet as pq
pf = pq.ParquetFile(url, filesystem=fs)
for i in range(pf.num_row_groups):
    table = pf.read_row_group(i, columns=["geometry", "name"])
    gdf = gpd.GeoDataFrame.from_arrow(table)
    # Process chunk...
```

### Writing GeoParquet

```python
import geopandas as gpd

# Simple write
gdf.to_parquet("output.parquet")

# With compression options
gdf.to_parquet(
    "output.parquet",
    compression="zstd",
    row_group_size=100000
)
```

### Performance Comparison

| Operation   | GeoParquet | FlatGeobuf |
| ----------- | ---------- | ---------- |
| Read (13MB) | 34.1ms     | 39.2ms     |
| Write       | 53.9ms     | 159ms      |

### Current Limitations

- No built-in spatial index (use STAC catalogs for organization)
- Files are immutable (no append)
- Bounding box queries not supported through GeoPandas (yet)

---

## FlatGeobuf

### Overview

FlatGeobuf is a binary file format for geographic vector data designed from the ground up for geospatial efficiency, with built-in spatial indexing.

### File Structure

```
┌─────────────────────────────────────┐
│ Magic Bytes (file signature)        │
├─────────────────────────────────────┤
│ Header                              │
│  ├── Bounding box                   │
│  ├── Geometry type                  │
│  ├── Attribute schema               │
│  ├── Feature count                  │
│  └── CRS                            │
├─────────────────────────────────────┤
│ Spatial Index (Hilbert R-Tree)      │
├─────────────────────────────────────┤
│ Features (row-based data)           │
└─────────────────────────────────────┘
```

### Hilbert R-Tree Spatial Index

The spatial index enables efficient range queries:

1. **R-Tree**: Hierarchical bounding boxes allowing rapid elimination of non-matching features
2. **Hilbert Curve**: Space-filling algorithm that keeps geographically proximate features together in file
3. **Static/Packed**: Optimized for immutable files

**Result**: Query specific regions without downloading entire file

### Key Characteristics

| Feature               | Details                                   |
| --------------------- | ----------------------------------------- |
| **Row-Based**         | Individual records stored contiguously    |
| **No Compression**    | Maintains random access capability        |
| **Streaming Support** | Progressive rendering during download     |
| **Immutable**         | Write-once, modifications require rewrite |

### Reading FlatGeobuf in Python

```python
import geopandas as gpd

# Local file
gdf = gpd.read_file("data.fgb", engine="pyogrio", use_arrow=True)

# Remote with spatial filter
gdf = gpd.read_file(
    url,
    bbox=(minx, miny, maxx, maxy),
    engine="pyogrio"
)

# Column selection
gdf = gpd.read_file(
    url,
    bbox=bounds,
    columns=["name", "geometry"],
    engine="pyogrio"
)
```

### Writing FlatGeobuf

```python
# Spatial index created automatically
gdf.to_file("output.fgb", driver="FlatGeobuf", engine="pyogrio")
```

### FlatGeobuf in JavaScript

```javascript
import { deserialize } from "flatgeobuf/geojson";

// Define bounding box
const bbox = {
    minX: -74.003802,
    minY: 40.725756,
    maxX: -73.981481,
    maxY: 40.744008
};

// Fetch features within bounds
const features = [];
for await (const feature of deserialize(url, bbox)) {
    features.push(feature);
}
```

### Access Patterns

| Method          | Description                | Use Case                       |
| --------------- | -------------------------- | ------------------------------ |
| **Download**    | Fetch entire file          | Small files, offline use       |
| **Streaming**   | Process during download    | Progressive rendering          |
| **Range Reads** | Fetch only needed sections | Spatial queries on large files |

---

## PMTiles

### Overview

PMTiles is a single-file archive format for tiled data, designed for serverless visualization. It consolidates millions of individual tiles into one manageable file.

### Structure

```
┌─────────────────────────────────────┐
│ Header (fixed length)               │
│  └── Decode instructions            │
├─────────────────────────────────────┤
│ Directories                         │
│  └── Tile location metadata         │
├─────────────────────────────────────┤
│ Tile Data (compressed)              │
│  └── Hilbert-curve ordered          │
└─────────────────────────────────────┘
```

### Key Features

- **Serverless**: Direct client access via HTTP range requests
- **Multiple Zoom Levels**: Full XYZ tile pyramids
- **Built-in Compression**: Reduces file size
- **Hilbert Curve Ordering**: Adjacent tiles stored together for efficient batch fetches

### Tiled vs. Analytical Data

| Aspect           | Tiled (PMTiles)     | Analytical (GeoParquet/FlatGeobuf) |
| ---------------- | ------------------- | ---------------------------------- |
| **Purpose**      | Visualization       | Analysis                           |
| **Geometry**     | Clipped, simplified | Complete, precise                  |
| **Optimization** | Rendering speed     | Query efficiency                   |

### Creating PMTiles

#### From Vector Data (using Tippecanoe)

```bash
tippecanoe -o output.pmtiles input.geojson
```

#### From MBTiles

```bash
pmtiles convert input.mbtiles output.pmtiles
```

### Using PMTiles

#### JavaScript (with MapLibre GL JS)

```javascript
import { PMTiles, Protocol } from "pmtiles";

const protocol = new Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

const map = new maplibregl.Map({
    style: {
        sources: {
            example: {
                type: "vector",
                url: "pmtiles://https://example.com/tiles.pmtiles"
            }
        }
    }
});
```

### Cost Comparison

| Approach            | Issues                         |
| ------------------- | ------------------------------ |
| MBTiles             | Requires server infrastructure |
| Individual S3 files | ~$5 per million files stored   |
| PMTiles             | Single file, minimal cost      |

---

## Zarr + STAC Integration

### Overview

STAC (SpatioTemporal Asset Catalogs) and Zarr serve complementary purposes:

| Aspect            | STAC                   | Zarr                      |
| ----------------- | ---------------------- | ------------------------- |
| **Purpose**       | Discover datasets      | Store array data          |
| **Metadata**      | Decoupled from storage | Coupled with data         |
| **Query Results** | Items/collections      | Array subsets             |
| **Best For**      | Finding datasets       | Filtering within datasets |

### Integration Strategies

#### 1. One Large Zarr Store

```
STAC Collection
  └── Asset: entire_dataset.zarr
```

- Best for aligned data cubes
- STAC purely for discovery
- Producer controls all structure

#### 2. Multiple Smaller Zarr Stores

```
STAC Collection
  ├── Item: scene_001.zarr
  ├── Item: scene_002.zarr
  └── ...
```

- Mirrors traditional COG approach
- Each scene stored separately
- More flexible discovery

#### 3. Virtual References

```
STAC Collection
  └── Asset: references.json (Kerchunk)
        └── Points to: original_data.nc, original_data2.nc, ...
```

- Data stays in original format
- No duplication
- Reference file provides Zarr interface

### For Data Producers

**Recommendations**:

1. Use STAC for spatial-temporal data discovery
2. Zarr suits well-aligned Level 3/4 data cubes
3. Un-aligned Level 1-2 imagery works well as COGs
4. Use Data Cube Extension for variable-level discovery
5. Consider xstac for automated metadata extraction

### For Data Consumers

**Best Practices**:

1. Prioritize lazy loading to minimize data transfer
2. Use consolidated metadata for faster access
3. Filter with pystac-client before accessing data
4. Consider storing results as new Zarr stores or virtual references

```python
import xarray as xr
import pystac_client

# Search STAC catalog
catalog = pystac_client.Client.open(stac_api_url)
items = catalog.search(
    collections=['dataset'],
    datetime='2023-01-01/2023-12-31',
    bbox=[-180, -90, 180, 90]
).items()

# Open Zarr assets
for item in items:
    zarr_url = item.assets['zarr'].href
    ds = xr.open_zarr(zarr_url, consolidated=True)
```

---

## Overture Maps

### Overview

Overture Maps Foundation provides a comprehensive, open map dataset containing nearly **4.2 billion features** distributed across six themed datasets. All data is distributed in **GeoParquet format**, making it a prime example of cloud-native geospatial data at scale.

**Key Characteristics**:

- Open, free access without registration
- Monthly releases with stable identifiers (GERS)
- Multi-source conflated data
- Cloud-optimized GeoParquet distribution
- ~500 GB total dataset size

### Data Access

#### Official Sources

| Provider       | URL Pattern                                                            |
| -------------- | ---------------------------------------------------------------------- |
| **Amazon S3**  | `s3://overturemaps-us-west-2/release/<RELEASE>/`                       |
| **Azure Blob** | `https://overturemapswestus2.blob.core.windows.net/release/<RELEASE>/` |

Current release: **2025-12-17.0**

#### Data Organization

```
release/
├── theme=addresses/
│   └── type=address/
├── theme=base/
│   ├── type=bathymetry/
│   ├── type=infrastructure/
│   ├── type=land/
│   ├── type=land_cover/
│   ├── type=land_use/
│   └── type=water/
├── theme=buildings/
│   ├── type=building/
│   └── type=building_part/
├── theme=divisions/
│   ├── type=division/
│   ├── type=division_area/
│   └── type=division_boundary/
├── theme=places/
│   └── type=place/
└── theme=transportation/
    ├── type=connector/
    └── type=segment/
```

#### Access Methods

**AWS CLI** (no authentication required):

```bash
aws s3 cp --no-sign-request --recursive \
  s3://overturemaps-us-west-2/release/2025-12-17.0/theme=places/type=place/ \
  ./places/
```

**Azure AzCopy**:

```bash
azcopy copy \
  "https://overturemapswestus2.dfs.core.windows.net/release/2025-12-17.0/theme=places/type=place/" \
  "<local_path>" --recursive
```

**DuckDB** (query directly from cloud):

```sql
INSTALL spatial;
INSTALL httpfs;
LOAD spatial;
LOAD httpfs;

SET s3_region = 'us-west-2';

SELECT id, names.primary, ST_AsText(geometry)
FROM read_parquet('s3://overturemaps-us-west-2/release/2025-12-17.0/theme=places/type=place/*')
WHERE bbox.xmin > -74.1 AND bbox.xmax < -73.9
  AND bbox.ymin > 40.7 AND bbox.ymax < 40.8
LIMIT 100;
```

**Python CLI**:

```bash
pip install overturemaps
overturemaps download --bbox -74.1,40.7,-73.9,40.8 -f geoparquet --type place -o nyc_places.parquet
```

### Global Entity Reference System (GERS)

GERS is a universal framework for structuring and matching map data across systems, providing stable identifiers for real-world entities.

#### Components

| Component                  | Purpose                                   |
| -------------------------- | ----------------------------------------- |
| **Overture Reference Map** | Monthly canonical datasets                |
| **Global Registry**        | Catalog of all published GERS IDs         |
| **Data Changelog**         | Documents entity changes across releases  |
| **Bridge Files**           | Links GERS IDs to source data identifiers |

#### Applications

1. **Data Association**: Connect third-party datasets to Overture features
2. **Cross-Release Stability**: Track entities across monthly updates
3. **Interoperability**: Create "GERS-enabled" datasets compatible with the ecosystem

### Schema Reference

#### Core Properties (All Features)

| Property   | Type    | Description                |
| ---------- | ------- | -------------------------- |
| `id`       | string  | GERS identifier            |
| `geometry` | WKB     | OGC-compliant spatial data |
| `bbox`     | object  | Bounding box coordinates   |
| `theme`    | string  | One of six data themes     |
| `type`     | string  | Feature type within theme  |
| `version`  | integer | Change tracking increment  |
| `sources`  | array   | Provenance metadata        |

#### Schema Conventions

- **Naming**: `snake_case` for database compatibility
- **Booleans**: Use `is_` or `has_` prefixes
- **Measurements**: SI units as scalars; regulatory values as `[value, unit]` arrays
- **Time**: OSM Opening Hours standard

### Data Themes

#### 1. Addresses (446M+ features)

Point geometry representing physical locations with address components.

**Key Properties**:
| Property | Description |
|----------|-------------|
| `country` | ISO 3166-1 alpha-2 code |
| `postcode` | Postal code |
| `street` | Street name |
| `number` | House number (may include suffixes like "74B") |
| `unit` | Suite/apartment/floor |
| `address_levels` | Country-dependent administrative divisions |

**Coverage**: 33 countries/regions (US: 121.5M, France: 26M)

**Use Cases**: Geocoding, address validation, conflation, standardization

```sql
-- Query addresses in a bounding box
SELECT id, number, street, postcode, ST_AsText(geometry)
FROM read_parquet('s3://overturemaps-us-west-2/release/2025-12-17.0/theme=addresses/type=address/*')
WHERE bbox.xmin > -122.5 AND bbox.xmax < -122.3
  AND bbox.ymin > 37.7 AND bbox.ymax < 37.9;
```

#### 2. Base (Land, Water, Infrastructure)

Foundation features for basemap rendering with six feature types.

| Type             | Description                       | Source           |
| ---------------- | --------------------------------- | ---------------- |
| `bathymetry`     | Underwater depth data             | ETOPO1, GLOBathy |
| `infrastructure` | Towers, piers, bridges            | OpenStreetMap    |
| `land`           | Physical land surfaces            | Coastline data   |
| `land_cover`     | Earth observation classifications | ESA WorldCover   |
| `land_use`       | Human activity classifications    | OpenStreetMap    |
| `water`          | Inland and ocean surfaces         | OpenStreetMap    |

#### 3. Buildings (2.6B+ features)

Human-made structures with roofs or interior spaces.

**Feature Types**:

- `building`: Outermost footprint/roofprint
- `building_part`: Individual segments of larger buildings

**Key Properties**:
| Property | Description |
|----------|-------------|
| `height` | Structure height in meters |
| `num_floors` | Floor count |
| `roof_shape` | Roof geometry type |
| `roof_material` | Construction material |
| `has_parts` | Boolean indicating associated parts |

**Sources**: OpenStreetMap (662M), Microsoft ML Footprints, Google Open Buildings, Esri Community Maps

**License**: ODbL (OpenStreetMap compatibility)

#### 4. Divisions (5.5M+ features)

Administrative boundaries from countries to microhoods.

**Feature Types**:

- `division`: Point geometry (approximate location)
- `division_area`: Polygon boundaries
- `division_boundary`: LineString shared borders

**Administrative Hierarchy** (12 levels):

| Level | Subtype        | Example                      |
| ----- | -------------- | ---------------------------- |
| 1     | `country`      | United States                |
| 2     | `dependency`   | Puerto Rico                  |
| 3     | `macroregion`  | Midwest (US), Occitanie (FR) |
| 4     | `region`       | California, Bavaria          |
| 5     | `macrocounty`  | Greater Manchester           |
| 6     | `county`       | Los Angeles County           |
| 7     | `localadmin`   | Township                     |
| 8     | `locality`     | San Francisco                |
| 9     | `borough`      | Manhattan                    |
| 10    | `macrohood`    | South Beach                  |
| 11    | `neighborhood` | Mission District             |
| 12    | `microhood`    | Balmy Alley                  |

**Use Cases**: Reverse geocoding, choropleth maps, containment checks

#### 5. Places (64M+ POIs)

Points of interest including businesses, landmarks, and public facilities.

**Key Properties**:
| Property | Description |
|----------|-------------|
| `categories` | Detailed taxonomy classification |
| `basic_category` | Simplified category |
| `confidence` | Validity score (0-1) |
| `websites` | Associated URLs |
| `phones` | Contact numbers |
| `addresses` | Location details |
| `brand` | Brand information |

**Sources**:
| Source | License | Features |
|--------|---------|----------|
| Meta | CDLA-Permissive-2.0 | 59M |
| Foursquare | Apache-2.0 | 6M |
| Microsoft | CDLA-Permissive-2.0 | 5.7M |
| AllThePlaces | CC0-1.0 | 1.6M |

```sql
-- Query restaurants in Manhattan
SELECT id, names.primary, categories.primary, confidence
FROM read_parquet('s3://overturemaps-us-west-2/release/2025-12-17.0/theme=places/type=place/*')
WHERE bbox.xmin > -74.02 AND bbox.xmax < -73.97
  AND bbox.ymin > 40.75 AND bbox.ymax < 40.80
  AND categories.primary LIKE '%restaurant%'
  AND confidence > 0.8;
```

#### 6. Transportation (300M+ road features)

Global road, rail, and water transportation networks.

**Feature Types**:

- `segment`: Physical transportation routes (LineString)
- `connector`: Routing decision points (Point)

**Road Classes**:
| Class | Description |
|-------|-------------|
| `motorway` | Controlled-access highways |
| `trunk` | Major roads |
| `primary` | Primary roads |
| `secondary` | Secondary roads |
| `tertiary` | Tertiary roads |
| `residential` | Residential streets |
| `service` | Service roads, driveways |
| `cycleway` | Bicycle paths |
| `footway` | Pedestrian paths |

**Key Properties**:

- Access restrictions
- Speed limits
- Surface materials
- Bridge/tunnel flags
- Width specifications

**Sources**: OpenStreetMap + TomTom (since 2024-09)

### Working with Overture Data

#### Python with GeoPandas

```python
import geopandas as gpd
import duckdb

# Connect to DuckDB
con = duckdb.connect()
con.execute("INSTALL spatial; INSTALL httpfs; LOAD spatial; LOAD httpfs;")
con.execute("SET s3_region = 'us-west-2';")

# Query buildings in San Francisco
query = """
SELECT id, names.primary as name, height, num_floors,
       ST_AsWKB(geometry) as geometry
FROM read_parquet('s3://overturemaps-us-west-2/release/2025-12-17.0/theme=buildings/type=building/*')
WHERE bbox.xmin > -122.45 AND bbox.xmax < -122.35
  AND bbox.ymin > 37.75 AND bbox.ymax < 37.80
  AND height IS NOT NULL
"""

# Convert to GeoDataFrame
df = con.execute(query).fetchdf()
gdf = gpd.GeoDataFrame(
    df,
    geometry=gpd.GeoSeries.from_wkb(df['geometry']),
    crs="EPSG:4326"
)
```

#### Pandas with JupySQL

```python
%load_ext sql
%sql duckdb://

%%sql
INSTALL spatial; INSTALL httpfs;
LOAD spatial; LOAD httpfs;
SET s3_region = 'us-west-2';

%%sql result <<
SELECT id, names.primary, ST_AsText(geometry)
FROM read_parquet('s3://overturemaps-us-west-2/release/2025-12-17.0/theme=base/type=water/*')
WHERE bbox.xmin > -95 AND bbox.xmax < -85
  AND bbox.ymin > 28 AND bbox.ymax < 31
LIMIT 1000;
```

#### QGIS Integration

1. Install QGIS with GDAL 3.8+
2. Add GeoParquet layer via browser or Layer menu
3. Use virtual file system paths:
    ```
    /vsicurl/https://overturemapswestus2.blob.core.windows.net/release/2025-12-17.0/theme=places/type=place/part-00000.parquet
    ```

### Attribution and Licensing

#### Theme Licenses

| Theme              | Primary License                       | Notes                       |
| ------------------ | ------------------------------------- | --------------------------- |
| **Addresses**      | Mixed (CC BY 4.0, CC0, Public Domain) | Varies by country           |
| **Base**           | ODbL + CC BY 4.0                      | OSM + ESA WorldCover        |
| **Buildings**      | ODbL                                  | OSM-compatible              |
| **Divisions**      | ODbL                                  | OSM + geoBoundaries         |
| **Places**         | CDLA-Permissive-2.0                   | Multiple commercial sources |
| **Transportation** | ODbL                                  | OSM + TomTom                |

#### Citation

When publishing work using Overture data:

```
Overture Maps Foundation, overturemaps.org
```

### Ecosystem Tools

| Tool             | Purpose                   |
| ---------------- | ------------------------- |
| **DuckDB**       | Direct cloud queries      |
| **Overture CLI** | Bounding box extraction   |
| **QGIS**         | Desktop GIS visualization |
| **Kepler.gl**    | Web-based exploration     |
| **Lonboard**     | Python visualization      |
| **MapLibre**     | Custom web maps           |
| **Apache Spark** | Large-scale processing    |
| **Wherobots**    | Cloud-native analysis     |

### Alternative Data Platforms

Several organizations maintain Overture data mirrors:

- **Google BigQuery**: SQL analytics
- **Databricks**: Spark-based processing
- **Snowflake**: Cloud data warehouse
- **Fused**: Serverless UDFs

---

## Glossary

### A-C

| Term                 | Definition                                                              |
| -------------------- | ----------------------------------------------------------------------- |
| **Amazon S3**        | Object storage service by Amazon Web Services                           |
| **Archive format**   | File storing multiple files, possibly compressed (ZIP, PMTiles)         |
| **Array Dimensions** | Number of variables in an array (e.g., lat, lon, time, temp = 4D)       |
| **Bandwidth**        | Data transfer speed over network                                        |
| **Chunk**            | Grouping of data within a file, typically 256×256 or 512×512 for images |
| **Cloud-Optimized**  | Property enabling partial file reads via HTTP range requests            |
| **COG**              | Cloud-Optimized GeoTIFF with defined internal chunking                  |
| **COPC**             | Cloud-Optimized Point Cloud format                                      |
| **Compression**      | Algorithm making data smaller; lossless or lossy                        |
| **CRS**              | Coordinate Reference System defining spatial reference                  |

### D-H

| Term                   | Definition                                                 |
| ---------------------- | ---------------------------------------------------------- |
| **Deflate**            | Lossless compression codec used in ZIP, COG, GeoTIFF       |
| **EPSG code**          | Projection definition from EPSG database (e.g., EPSG:4326) |
| **fsspec**             | Python library for file system abstraction                 |
| **GDAL**               | Geospatial Data Abstraction Library for raster operations  |
| **GeoJSON**            | JSON-based vector format; not cloud-optimized              |
| **GeoParquet**         | Parquet extension for geospatial vector data               |
| **GeoTIFF**            | TIFF extension with geospatial metadata                    |
| **Geotransform**       | Six numbers defining raster position in CRS                |
| **Hilbert curve**      | Space-filling curve for spatial indexing                   |
| **HTTP Range Request** | HTTP feature for requesting specific byte ranges           |

### I-O

| Term                     | Definition                                            |
| ------------------------ | ----------------------------------------------------- |
| **Internal compression** | Compression built into file format                    |
| **JPEG**                 | Lossy compression for visual images                   |
| **Latency**              | Time until data starts arriving from server           |
| **LERC**                 | Limited Error Raster Compression for float data       |
| **Lossless**             | Compression preserving exact original values          |
| **Lossy**                | Compression with information loss                     |
| **Metadata**             | Information about data enabling recreation and access |
| **Multithreading**       | Parallel processing technique                         |
| **Object storage**       | Scalable cloud storage (S3, GCS, Azure Blob)          |
| **OGR**                  | Library for vector format conversion                  |
| **Overviews**            | Downsampled data for visualization (pyramids)         |

### P-Z

| Term                    | Definition                                            |
| ----------------------- | ----------------------------------------------------- |
| **Parquet**             | Columnar file format with chunking and compression    |
| **PDAL**                | Point Data Abstraction Library                        |
| **PMTiles**             | Cloud-optimized archive for tiled data                |
| **Point Cloud**         | 3D point data from LiDAR or photogrammetry            |
| **Random access**       | Fetching file parts without reading entire file       |
| **Raster data**         | Regularly-gridded data with constant cell sizes       |
| **Shapefile**           | Legacy vector format with recognized limitations      |
| **Space-filling curve** | Algorithm mapping n-dimensional to 1-dimensional data |
| **Spatial index**       | Data structure for efficient spatial search           |
| **TIFF**                | Tagged Image File Format                              |
| **Vector data**         | Points, lines, and polygons                           |
| **WKB**                 | Well-Known Binary encoding for geometries             |
| **Zarr**                | Chunked, compressed format for multidimensional data  |
| **ZSTD**                | Efficient lossless compression codec                  |

### Overture Maps Terms

| Term              | Definition                                                                  |
| ----------------- | --------------------------------------------------------------------------- |
| **GERS**          | Global Entity Reference System - stable identifiers for real-world entities |
| **Overture Maps** | Open map dataset with 4.2B features in GeoParquet format                    |
| **Conflation**    | Process of merging data from multiple sources into unified features         |
| **ODbL**          | Open Database License - copyleft license used by OpenStreetMap              |
| **CDLA**          | Community Data License Agreement - permissive data sharing license          |
| **POI**           | Point of Interest - places like businesses, landmarks, facilities           |
| **Connector**     | Point feature marking routing decision points in transportation             |
| **Segment**       | LineString feature representing physical transportation routes              |
| **Division**      | Administrative boundary feature (country to microhood)                      |

---

## Format Selection Guide

This section provides practical guidance for choosing between formats based on real-world requirements.

### Quick Reference by Data Type

| Data Type               | Best Format         | Alternatives           |
| ----------------------- | ------------------- | ---------------------- |
| Single-band raster      | COG                 | -                      |
| Multi-band raster (RGB) | COG                 | -                      |
| Multidimensional cube   | Zarr                | Cloud-optimized NetCDF |
| Legacy NetCDF/HDF5      | Kerchunk references | Cloud-optimized HDF5   |
| Point clouds            | COPC                | EPT                    |
| Large vector datasets   | GeoParquet          | FlatGeobuf             |
| Spatial query vector    | FlatGeobuf          | GeoParquet with bbox   |
| Web map tiles           | PMTiles             | -                      |

### GeoParquet vs FlatGeobuf: Decision Matrix

This is the most common decision point for vector data. Both are cloud-native, but optimized for different access patterns.

| Factor                | GeoParquet                            | FlatGeobuf                      |
| --------------------- | ------------------------------------- | ------------------------------- |
| **File size**         | Smaller (columnar compression)        | Larger (no compression)         |
| **Write speed**       | Fast (11s for 498MB CSV)              | Slow (1m 47s for same)          |
| **Column selection**  | Excellent (only fetch needed columns) | Poor (must read all properties) |
| **Spatial queries**   | Coarse (row-group level)              | Precise (per-feature index)     |
| **Analytics**         | Excellent (predicate pushdown)        | Poor                            |
| **Browser streaming** | Requires full row groups              | Progressive rendering           |
| **Ecosystem**         | Spark, DuckDB, BigQuery, Snowflake    | Leaflet, OpenLayers, QGIS       |

#### Choose GeoParquet when:

- **Analytics workloads**: Aggregations, filtering by attributes, column selection
- **Large-scale processing**: Spark, Dask, distributed computing
- **Storage cost matters**: 2-3x smaller than FlatGeobuf
- **You need specific columns**: "Give me just names and populations"
- **Attribute filtering**: "WHERE population > 1000000"
- **Data warehouse integration**: BigQuery, Snowflake, Databricks

```python
# GeoParquet shines here - only fetches 2 columns from matching row groups
gdf = gpd.read_parquet(
    "s3://bucket/places.parquet",
    columns=["name", "geometry"],
    filters=[("population", ">", 1000000)]
)
```

#### Choose FlatGeobuf when:

- **Spatial queries**: "Give me everything in this bounding box"
- **Web mapping**: Direct browser access without server
- **Streaming**: Progressive loading during download
- **Small precise queries**: Fetching 100 features from 10 million
- **PMTiles creation**: Tippecanoe works best with FlatGeobuf

```javascript
// FlatGeobuf shines here - fetches only features in bbox
for await (const feature of flatgeobuf.deserialize(url, bbox)) {
    map.addFeature(feature);
}
```

#### Hybrid approach:

For maximum flexibility, maintain both formats:

- GeoParquet for analytics and bulk processing
- FlatGeobuf for web visualization and spatial queries

### Performance Benchmarks

Based on real-world testing (498MB CSV source):

| Format              | Write Time | File Size | Read (full) | Read (10% bbox) |
| ------------------- | ---------- | --------- | ----------- | --------------- |
| GeoParquet (Snappy) | 11s        | 152MB     | 6s          | ~2s             |
| GeoParquet (Brotli) | 18s        | 104MB     | 8s          | ~3s             |
| FlatGeobuf          | 107s       | ~400MB    | 40s         | ~0.5s           |
| GeoPackage          | 100s       | ~450MB    | 45s         | ~5s             |
| Shapefile           | 102s       | ~500MB    | 42s         | N/A             |

**Key insight**: GeoParquet wins on size and full-file operations; FlatGeobuf wins on precise spatial queries.

### When to Just Download

Cloud-optimization has overhead. Sometimes downloading is better:

| Scenario                          | Recommendation     |
| --------------------------------- | ------------------ |
| File < 50MB                       | Just download      |
| Need > 50% of data                | Just download      |
| Single local user                 | Just download      |
| Repeated access                   | Download and cache |
| File > 500MB, need < 10%          | Cloud-optimized    |
| Multiple users, different subsets | Cloud-optimized    |
| Serverless/Lambda                 | Cloud-optimized    |

### Format Selection Flowchart

```
Is it raster data?
├── Yes → Is it multidimensional (time, bands, depth)?
│         ├── Yes → Zarr (or Kerchunk for existing NetCDF)
│         └── No → COG
└── No → Is it point cloud data?
          ├── Yes → COPC
          └── No → Is it for visualization tiles?
                    ├── Yes → PMTiles
                    └── No → Vector data
                              ├── Primary use: Analytics/warehouse?
                              │   └── Yes → GeoParquet
                              ├── Primary use: Web spatial queries?
                              │   └── Yes → FlatGeobuf
                              └── Need both? → Maintain both formats
```

### Chunk/Row Group Sizing Guidelines

| Access Pattern            | Recommended Size | Rationale                 |
| ------------------------- | ---------------- | ------------------------- |
| Web mapping (small bbox)  | 1-4MB            | Many small queries        |
| Analytics (full scans)    | 16-64MB          | Fewer requests            |
| Mixed workload            | 8-16MB           | Balance                   |
| High-latency network      | Larger           | Amortize request overhead |
| Low-latency (same region) | Smaller          | Fine-grained access       |

### Common Mistakes

1. **Using Shapefile for anything new**
    - Limited to 4GB, 10-character field names, no CRS standardization
    - Use GeoParquet or GeoPackage instead

2. **Assuming GeoParquet has spatial indexing**
    - It has bbox statistics, not a true spatial index
    - For precise spatial queries, use FlatGeobuf or add spatial partitioning

3. **Small chunks for analytics**
    - More HTTP requests = slower
    - Use larger row groups (50K-100K rows) for scan workloads

4. **Large chunks for web mapping**
    - Over-fetching wastes bandwidth
    - Use smaller chunks or FlatGeobuf's per-feature index

5. **Ignoring predicate pushdown**
    - Add bbox columns to GeoParquet for spatial filtering
    - Add timestamp/category columns for common filters

6. **Not consolidating Zarr metadata**
    - Without consolidation, one HTTP request per chunk metadata file
    - Always run `zarr.consolidate_metadata()`

---

## Implementation Guide

This section provides production-ready code for implementing cloud-native geospatial data access.

### Low-Level: HTTP Range Request Client

Understanding the raw HTTP mechanics helps debug issues and build custom clients.

#### Python: Raw Range Requests

```python
import httpx
import struct
from typing import Optional, Tuple

class RangeRequestClient:
    """Low-level HTTP range request client for cloud-optimized formats."""

    def __init__(self, url: str, timeout: float = 30.0):
        self.url = url
        self.timeout = timeout
        self._client: Optional[httpx.Client] = None
        self._file_size: Optional[int] = None

    def __enter__(self):
        self._client = httpx.Client(timeout=self.timeout, http2=True)
        return self

    def __exit__(self, *args):
        if self._client:
            self._client.close()

    @property
    def file_size(self) -> int:
        """Get total file size via HEAD request."""
        if self._file_size is None:
            resp = self._client.head(self.url)
            resp.raise_for_status()
            self._file_size = int(resp.headers.get("content-length", 0))
        return self._file_size

    def fetch_range(self, start: int, end: int) -> bytes:
        """Fetch specific byte range. Returns bytes."""
        headers = {"Range": f"bytes={start}-{end}"}
        resp = self._client.get(self.url, headers=headers)

        # Check for proper range response
        if resp.status_code == 206:  # Partial Content
            return resp.content
        elif resp.status_code == 200:  # Server doesn't support ranges
            raise RuntimeError(
                f"Server returned 200 instead of 206. "
                f"Range requests not supported for {self.url}"
            )
        else:
            resp.raise_for_status()

    def fetch_tail(self, num_bytes: int) -> bytes:
        """Fetch last N bytes of file."""
        start = self.file_size - num_bytes
        return self.fetch_range(start, self.file_size - 1)


# Example: Read Parquet footer manually
def read_parquet_footer(url: str) -> dict:
    """
    Manually read Parquet file footer to understand the structure.
    Returns metadata about row groups and columns.
    """
    with RangeRequestClient(url) as client:
        # Step 1: Read last 8 bytes (4-byte footer length + "PAR1" magic)
        tail = client.fetch_tail(8)

        # Parse footer length (little-endian 4-byte int)
        footer_length = struct.unpack('<I', tail[:4])[0]
        magic = tail[4:8]

        if magic != b'PAR1':
            raise ValueError(f"Not a valid Parquet file: magic={magic}")

        # Step 2: Read the actual footer
        footer_start = client.file_size - 8 - footer_length
        footer_bytes = client.fetch_range(footer_start, client.file_size - 9)

        return {
            "footer_length": footer_length,
            "footer_start": footer_start,
            "file_size": client.file_size,
            "footer_bytes": footer_bytes,  # Thrift-encoded metadata
            "requests_made": 2  # HEAD + 1 range request (we combined tail reads)
        }
```

#### JavaScript: Browser Range Requests

```javascript
/**
 * Fetch a byte range from a URL using the Fetch API.
 * Works in browsers with proper CORS configuration.
 */
async function fetchRange(url, start, end) {
    const response = await fetch(url, {
        headers: { "Range": `bytes=${start}-${end}` }
    });

    if (response.status === 206) {
        return await response.arrayBuffer();
    } else if (response.status === 200) {
        throw new Error("Server does not support range requests");
    } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
}

/**
 * Read Parquet footer from a remote file.
 */
async function readParquetFooter(url) {
    // Get file size
    const headResponse = await fetch(url, { method: "HEAD" });
    const fileSize = parseInt(headResponse.headers.get("content-length"));

    // Read last 8 bytes
    const tailBuffer = await fetchRange(url, fileSize - 8, fileSize - 1);
    const tailView = new DataView(tailBuffer);

    // Parse footer length (little-endian)
    const footerLength = tailView.getUint32(0, true);

    // Verify magic bytes
    const magic = new Uint8Array(tailBuffer, 4, 4);
    const magicStr = String.fromCharCode(...magic);
    if (magicStr !== "PAR1") {
        throw new Error(`Invalid Parquet file: magic=${magicStr}`);
    }

    // Read footer
    const footerStart = fileSize - 8 - footerLength;
    const footerBuffer = await fetchRange(url, footerStart, fileSize - 9);

    return {
        footerLength,
        footerStart,
        fileSize,
        footerBuffer // Thrift-encoded, needs parsing
    };
}
```

### Mid-Level: Using Libraries Correctly

#### Python: GeoParquet with Predicate Pushdown

```python
import geopandas as gpd
import pyarrow.parquet as pq
from pyarrow import fs
import pandas as pd

def read_geoparquet_optimized(
    url: str,
    bbox: tuple = None,  # (minx, miny, maxx, maxy)
    columns: list = None,
    filters: list = None,  # PyArrow filter expressions
    row_groups: list = None  # Specific row groups to read
) -> gpd.GeoDataFrame:
    """
    Read GeoParquet with all optimizations enabled.

    Args:
        url: S3, HTTP, or local path to GeoParquet file
        bbox: Bounding box filter (uses bbox column statistics)
        columns: Columns to read (None = all)
        filters: PyArrow filters for predicate pushdown
        row_groups: Specific row groups to read

    Returns:
        GeoDataFrame with only requested data
    """
    # Determine filesystem
    if url.startswith('s3://'):
        filesystem = fs.S3FileSystem(anonymous=True)
        path = url.replace('s3://', '')
    elif url.startswith('http'):
        # Use fsspec for HTTP
        import fsspec
        filesystem = fsspec.filesystem('https')
        path = url
    else:
        filesystem = fs.LocalFileSystem()
        path = url

    # Build filters including bbox
    all_filters = filters or []
    if bbox:
        minx, miny, maxx, maxy = bbox
        # Add bbox filters - these use row group statistics
        bbox_filters = [
            ('bbox', 'xmin', '<=', maxx),
            ('bbox', 'xmax', '>=', minx),
            ('bbox', 'ymin', '<=', maxy),
            ('bbox', 'ymax', '>=', miny),
        ]
        # Note: Actual filter syntax depends on your bbox column structure
        # This is conceptual - adjust based on your schema

    # Read with optimizations
    table = pq.read_table(
        path,
        filesystem=filesystem,
        columns=columns,
        filters=all_filters if all_filters else None,
        use_pandas_metadata=True
    )

    # Convert to GeoDataFrame
    gdf = gpd.GeoDataFrame.from_arrow(table)

    # Apply precise bbox filter (row group filtering is coarse)
    if bbox:
        gdf = gdf.cx[minx:maxx, miny:maxy]

    return gdf


# Example usage with Overture Maps
def query_overture_places(bbox: tuple, category: str = None) -> gpd.GeoDataFrame:
    """
    Query Overture Maps places with spatial and attribute filters.

    This demonstrates efficient cloud-native access patterns.
    """
    import duckdb

    minx, miny, maxx, maxy = bbox

    # DuckDB handles the HTTP range requests internally
    con = duckdb.connect()
    con.execute("INSTALL spatial; INSTALL httpfs; LOAD spatial; LOAD httpfs;")
    con.execute("SET s3_region = 'us-west-2';")

    # Build query with bbox pushdown
    query = f"""
    SELECT
        id,
        names.primary as name,
        categories.primary as category,
        confidence,
        ST_AsWKB(geometry) as geometry
    FROM read_parquet(
        's3://overturemaps-us-west-2/release/2025-01-22.0/theme=places/type=place/*',
        hive_partitioning=true
    )
    WHERE bbox.xmin <= {maxx}
      AND bbox.xmax >= {minx}
      AND bbox.ymin <= {maxy}
      AND bbox.ymax >= {miny}
    """

    if category:
        query += f"\n  AND categories.primary LIKE '%{category}%'"

    query += "\n  AND confidence > 0.7"

    df = con.execute(query).fetchdf()

    # Convert to GeoDataFrame
    gdf = gpd.GeoDataFrame(
        df.drop(columns=['geometry']),
        geometry=gpd.GeoSeries.from_wkb(df['geometry']),
        crs="EPSG:4326"
    )

    return gdf
```

#### Python: COG with Rasterio

```python
import rasterio
from rasterio.windows import Window, from_bounds
from rasterio.session import AWSSession
from rasterio.enums import Resampling
import numpy as np
from typing import Tuple, Optional
import boto3

class COGReader:
    """
    Efficient Cloud-Optimized GeoTIFF reader with proper session management.
    """

    def __init__(self, url: str, aws_profile: str = None):
        self.url = url
        self.aws_profile = aws_profile
        self._dataset = None
        self._env = None

    def __enter__(self):
        # Configure AWS session for unsigned access to public data
        if self.url.startswith('s3://'):
            session = boto3.Session(profile_name=self.aws_profile)
            self._env = rasterio.Env(
                AWSSession(session, requester_pays=False),
                AWS_NO_SIGN_REQUEST='YES',
                GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',
                CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif,.tiff,.TIF,.TIFF',
                GDAL_HTTP_MULTIRANGE='YES',
                GDAL_HTTP_MERGE_CONSECUTIVE_RANGES='YES',
            )
            self._env.__enter__()

        self._dataset = rasterio.open(self.url)
        return self

    def __exit__(self, *args):
        if self._dataset:
            self._dataset.close()
        if self._env:
            self._env.__exit__(*args)

    @property
    def metadata(self) -> dict:
        """Get COG metadata without reading pixel data."""
        return {
            'bounds': self._dataset.bounds,
            'crs': self._dataset.crs.to_string(),
            'width': self._dataset.width,
            'height': self._dataset.height,
            'count': self._dataset.count,
            'dtype': self._dataset.dtypes[0],
            'block_shapes': self._dataset.block_shapes,
            'overviews': [self._dataset.overviews(i) for i in range(1, self._dataset.count + 1)],
            'is_tiled': self._dataset.is_tiled,
        }

    def read_window(
        self,
        bounds: Tuple[float, float, float, float],
        target_resolution: float = None,
    ) -> Tuple[np.ndarray, dict]:
        """
        Read a spatial window, automatically selecting appropriate overview.

        Args:
            bounds: (minx, miny, maxx, maxy) in dataset CRS
            target_resolution: Desired resolution in CRS units (None = full res)

        Returns:
            Tuple of (numpy array, window metadata)
        """
        minx, miny, maxx, maxy = bounds

        # Calculate window
        window = from_bounds(minx, miny, maxx, maxy, self._dataset.transform)

        # Determine best overview level
        if target_resolution and self._dataset.overviews(1):
            native_res = self._dataset.res[0]
            overview_level = None

            for i, factor in enumerate(self._dataset.overviews(1)):
                overview_res = native_res * factor
                if overview_res <= target_resolution:
                    overview_level = i
                    break

            if overview_level is not None:
                # Read from overview
                factor = self._dataset.overviews(1)[overview_level]
                out_shape = (
                    self._dataset.count,
                    int(window.height / factor),
                    int(window.width / factor)
                )
                data = self._dataset.read(
                    window=window,
                    out_shape=out_shape,
                    resampling=Resampling.nearest
                )
            else:
                data = self._dataset.read(window=window)
        else:
            data = self._dataset.read(window=window)

        # Get transform for the window
        window_transform = self._dataset.window_transform(window)

        return data, {
            'transform': window_transform,
            'crs': self._dataset.crs,
            'bounds': bounds,
            'shape': data.shape,
        }

    def read_tile(self, col: int, row: int, level: int = 0) -> np.ndarray:
        """
        Read a specific internal tile by column/row index.

        This is the most efficient access pattern - exactly 1 HTTP request per tile.
        """
        block_height, block_width = self._dataset.block_shapes[0]

        window = Window(
            col_off=col * block_width,
            row_off=row * block_height,
            width=block_width,
            height=block_height
        )

        return self._dataset.read(window=window)


# Example: Reading a COG from public S3
def example_cog_usage():
    # NAIP imagery COG (public)
    url = "s3://naip-visualization/ny/2019/60cm/rgb/42074/m_4207459_ne_18_060_20190830.tif"

    with COGReader(url) as reader:
        # Get metadata (1 HTTP request)
        print("Metadata:", reader.metadata)

        # Read a small window (1-2 HTTP requests)
        bounds = (-73.95, 40.75, -73.94, 40.76)  # Small area in NYC
        data, meta = reader.read_window(bounds, target_resolution=10.0)
        print(f"Read {data.shape} array")

        # Read a specific tile (1 HTTP request)
        tile = reader.read_tile(col=5, row=10)
        print(f"Tile shape: {tile.shape}")
```

#### JavaScript: FlatGeobuf in Browser

```javascript
import * as flatgeobuf from "flatgeobuf";

/**
 * Stream FlatGeobuf features within a bounding box.
 * Features are yielded as they arrive - no need to wait for all.
 */
async function* streamFeaturesInBbox(url, bbox) {
    const { minX, minY, maxX, maxY } = bbox;

    // Create an async iterator over features
    const iter = flatgeobuf.geojson.deserialize(url, {
        minX,
        minY,
        maxX,
        maxY
    });

    for await (const feature of iter) {
        yield feature;
    }
}

/**
 * Load FlatGeobuf features into a Leaflet map with progress tracking.
 */
async function loadFeaturesIntoMap(map, url, bbox, options = {}) {
    const {
        maxFeatures = 10000,
        onProgress = () => {},
        style = { color: "#3388ff", weight: 2 }
    } = options;

    const layer = L.geoJSON(null, { style });
    layer.addTo(map);

    let count = 0;
    const startTime = Date.now();

    try {
        for await (const feature of streamFeaturesInBbox(url, bbox)) {
            layer.addData(feature);
            count++;

            // Report progress every 100 features
            if (count % 100 === 0) {
                onProgress({
                    count,
                    elapsed: Date.now() - startTime,
                    featuresPerSecond: count / ((Date.now() - startTime) / 1000)
                });
            }

            if (count >= maxFeatures) {
                console.warn(`Reached max features limit: ${maxFeatures}`);
                break;
            }
        }
    } catch (error) {
        if (error.name === "AbortError") {
            console.log("Feature loading was aborted");
        } else {
            throw error;
        }
    }

    onProgress({
        count,
        elapsed: Date.now() - startTime,
        complete: true
    });

    return layer;
}

/**
 * Example: Interactive map with FlatGeobuf
 */
async function initMap() {
    const map = L.map("map").setView([40.7, -73.95], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

    const fgbUrl = "https://example.com/buildings.fgb";

    // Load features in current view
    const loadCurrentView = async () => {
        const bounds = map.getBounds();
        const bbox = {
            minX: bounds.getWest(),
            minY: bounds.getSouth(),
            maxX: bounds.getEast(),
            maxY: bounds.getNorth()
        };

        await loadFeaturesIntoMap(map, fgbUrl, bbox, {
            maxFeatures: 5000,
            onProgress: (p) => {
                document.getElementById("status").textContent = p.complete
                    ? `Loaded ${p.count} features in ${p.elapsed}ms`
                    : `Loading... ${p.count} features`;
            }
        });
    };

    // Reload on map move
    map.on("moveend", loadCurrentView);
    await loadCurrentView();
}
```

### High-Level: Complete Application Patterns

#### Python: Async Parallel Fetching

```python
import asyncio
import httpx
from typing import List, Tuple
import geopandas as gpd
from shapely import wkb

async def fetch_multiple_row_groups(
    url: str,
    row_group_ranges: List[Tuple[int, int]],  # List of (start, end) byte ranges
    max_concurrent: int = 4
) -> List[bytes]:
    """
    Fetch multiple row groups in parallel with concurrency limit.
    """
    semaphore = asyncio.Semaphore(max_concurrent)

    async def fetch_one(start: int, end: int) -> bytes:
        async with semaphore:
            async with httpx.AsyncClient(http2=True) as client:
                resp = await client.get(
                    url,
                    headers={"Range": f"bytes={start}-{end}"},
                    timeout=30.0
                )
                if resp.status_code != 206:
                    raise RuntimeError(f"Expected 206, got {resp.status_code}")
                return resp.content

    tasks = [fetch_one(start, end) for start, end in row_group_ranges]
    results = await asyncio.gather(*tasks)
    return results


class AsyncGeoParquetReader:
    """
    Async reader for GeoParquet that parallelizes row group fetching.

    Useful when you need data from multiple non-contiguous row groups.
    """

    def __init__(self, url: str):
        self.url = url
        self._metadata = None

    async def _fetch_metadata(self):
        """Fetch and parse Parquet footer."""
        async with httpx.AsyncClient(http2=True) as client:
            # Get file size
            head = await client.head(self.url)
            file_size = int(head.headers["content-length"])

            # Fetch footer length
            resp = await client.get(
                self.url,
                headers={"Range": f"bytes={file_size-8}-{file_size-1}"}
            )
            import struct
            footer_len = struct.unpack('<I', resp.content[:4])[0]

            # Fetch footer
            footer_start = file_size - 8 - footer_len
            resp = await client.get(
                self.url,
                headers={"Range": f"bytes={footer_start}-{file_size-9}"}
            )

            # Parse with pyarrow (sync, but fast)
            import pyarrow.parquet as pq
            # Note: In practice, you'd use pyarrow's internal footer parsing
            # This is simplified for illustration
            return {
                "file_size": file_size,
                "footer_length": footer_len,
                "footer_start": footer_start
            }

    async def read_bbox(
        self,
        bbox: Tuple[float, float, float, float],
        columns: List[str] = None
    ) -> gpd.GeoDataFrame:
        """
        Read features within bounding box using async parallel fetching.
        """
        # For actual implementation, you'd:
        # 1. Parse footer to get row group metadata
        # 2. Filter row groups by bbox statistics
        # 3. Fetch matching row groups in parallel
        # 4. Parse and combine

        # Simplified: use DuckDB which handles this internally
        import duckdb

        minx, miny, maxx, maxy = bbox
        cols = ", ".join(columns) if columns else "*"

        con = duckdb.connect()
        con.execute("INSTALL httpfs; LOAD httpfs;")

        query = f"""
        SELECT {cols}
        FROM read_parquet('{self.url}')
        WHERE bbox.xmin <= {maxx}
          AND bbox.xmax >= {minx}
          AND bbox.ymin <= {maxy}
          AND bbox.ymax >= {miny}
        """

        return con.execute(query).fetchdf()


# Example usage
async def main():
    reader = AsyncGeoParquetReader(
        "https://example.com/large_dataset.parquet"
    )

    # Read multiple bboxes in parallel
    bboxes = [
        (-74.0, 40.7, -73.9, 40.8),  # NYC
        (-122.5, 37.7, -122.3, 37.9),  # SF
        (-87.7, 41.8, -87.6, 41.9),  # Chicago
    ]

    tasks = [reader.read_bbox(bbox) for bbox in bboxes]
    results = await asyncio.gather(*tasks)

    for bbox, gdf in zip(bboxes, results):
        print(f"Bbox {bbox}: {len(gdf)} features")


if __name__ == "__main__":
    asyncio.run(main())
```

### Error Handling Patterns

```python
import httpx
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type
)
from typing import Optional
import logging

logger = logging.getLogger(__name__)


class CloudNativeError(Exception):
    """Base exception for cloud-native operations."""
    pass


class RangeRequestNotSupported(CloudNativeError):
    """Server doesn't support HTTP range requests."""
    pass


class PartialContentError(CloudNativeError):
    """Error reading partial content."""
    pass


class RetryableError(CloudNativeError):
    """Transient error that can be retried."""
    pass


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    retry=retry_if_exception_type(RetryableError),
    before_sleep=lambda retry_state: logger.warning(
        f"Retrying after {retry_state.outcome.exception()}"
    )
)
def fetch_range_with_retry(
    client: httpx.Client,
    url: str,
    start: int,
    end: int,
    timeout: float = 30.0
) -> bytes:
    """
    Fetch byte range with retry logic for transient failures.
    """
    try:
        resp = client.get(
            url,
            headers={"Range": f"bytes={start}-{end}"},
            timeout=timeout
        )
    except httpx.TimeoutException as e:
        raise RetryableError(f"Timeout fetching {url}") from e
    except httpx.NetworkError as e:
        raise RetryableError(f"Network error: {e}") from e

    if resp.status_code == 206:
        # Verify we got what we asked for
        content_range = resp.headers.get("content-range", "")
        expected = f"bytes {start}-{end}/"
        if not content_range.startswith(expected):
            raise PartialContentError(
                f"Unexpected content-range: {content_range}, expected {expected}*"
            )
        return resp.content

    elif resp.status_code == 200:
        raise RangeRequestNotSupported(
            f"Server returned 200 instead of 206. "
            f"Range requests not supported. "
            f"Headers: {dict(resp.headers)}"
        )

    elif resp.status_code in (500, 502, 503, 504):
        raise RetryableError(f"Server error {resp.status_code}")

    elif resp.status_code == 403:
        raise CloudNativeError(
            f"Access denied. Check credentials and bucket permissions."
        )

    elif resp.status_code == 404:
        raise CloudNativeError(f"File not found: {url}")

    else:
        raise CloudNativeError(
            f"Unexpected status {resp.status_code}: {resp.text[:200]}"
        )


def validate_cloud_optimized_parquet(url: str) -> dict:
    """
    Validate that a Parquet file is properly cloud-optimized.

    Returns dict with validation results and recommendations.
    """
    issues = []
    recommendations = []

    with httpx.Client() as client:
        # Check range request support
        try:
            head = client.head(url)
            if 'accept-ranges' not in head.headers:
                issues.append("Server doesn't advertise Accept-Ranges header")
            elif head.headers['accept-ranges'] != 'bytes':
                issues.append(f"Accept-Ranges is '{head.headers['accept-ranges']}', not 'bytes'")
        except Exception as e:
            issues.append(f"HEAD request failed: {e}")
            return {"valid": False, "issues": issues}

        file_size = int(head.headers.get('content-length', 0))

        # Try a range request
        try:
            resp = client.get(url, headers={"Range": "bytes=0-7"})
            if resp.status_code != 206:
                issues.append(f"Range request returned {resp.status_code}, not 206")
        except Exception as e:
            issues.append(f"Range request failed: {e}")

        # Check Parquet footer
        try:
            import struct
            tail = fetch_range_with_retry(client, url, file_size - 8, file_size - 1)
            footer_len = struct.unpack('<I', tail[:4])[0]
            magic = tail[4:8]

            if magic != b'PAR1':
                issues.append(f"Invalid Parquet magic bytes: {magic}")

            # Check footer size
            if footer_len > 10 * 1024 * 1024:  # > 10MB
                issues.append(f"Footer is very large ({footer_len} bytes)")
                recommendations.append(
                    "Consider reducing number of columns or row groups"
                )
        except Exception as e:
            issues.append(f"Cannot read Parquet footer: {e}")

    return {
        "valid": len(issues) == 0,
        "issues": issues,
        "recommendations": recommendations,
        "file_size": file_size,
        "footer_length": footer_len if 'footer_len' in dir() else None
    }
```

---

## Infrastructure Setup

This section covers server and cloud configuration for serving cloud-optimized files.

### AWS S3 Configuration

#### Bucket Policy for Public Read

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::your-bucket-name/*"
        }
    ]
}
```

#### CORS Configuration for Browser Access

```json
[
    {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["GET", "HEAD"],
        "AllowedOrigins": ["*"],
        "ExposeHeaders": ["Content-Length", "Content-Range", "Accept-Ranges", "ETag"],
        "MaxAgeSeconds": 3600
    }
]
```

**Apply via AWS CLI:**

```bash
aws s3api put-bucket-cors --bucket your-bucket-name --cors-configuration file://cors.json
```

#### S3 Static Website Hosting (Alternative)

For simpler CORS handling, enable static website hosting:

```bash
aws s3 website s3://your-bucket-name/ --index-document index.html
```

Access via: `http://your-bucket-name.s3-website-us-east-1.amazonaws.com/path/to/file.parquet`

### CloudFront CDN Configuration

#### Basic Distribution

```yaml
# CloudFormation template snippet
CloudFrontDistribution:
    Type: AWS::CloudFront::Distribution
    Properties:
        DistributionConfig:
            Origins:
                - DomainName: your-bucket-name.s3.amazonaws.com
                  Id: S3Origin
                  S3OriginConfig:
                      OriginAccessIdentity: ""
            Enabled: true
            DefaultCacheBehavior:
                TargetOriginId: S3Origin
                ViewerProtocolPolicy: redirect-to-https
                AllowedMethods:
                    - GET
                    - HEAD
                    - OPTIONS
                CachedMethods:
                    - GET
                    - HEAD
                    - OPTIONS
                ForwardedValues:
                    QueryString: false
                    Headers:
                        - Origin
                        - Access-Control-Request-Method
                        - Access-Control-Request-Headers
                # Cache OPTIONS requests (important for FlatGeobuf!)
                MinTTL: 0
                DefaultTTL: 86400
                MaxTTL: 31536000
```

#### Enable Range Request Caching

CloudFront caches range requests by default when:

1. Origin returns `Accept-Ranges: bytes`
2. Response includes `Content-Range` header
3. Cache behavior allows GET/HEAD methods

**Important**: Ensure your cache policy includes the `Range` header:

```yaml
CachePolicy:
    Type: AWS::CloudFront::CachePolicy
    Properties:
        CachePolicyConfig:
            Name: RangeRequestCachePolicy
            MinTTL: 1
            MaxTTL: 31536000
            DefaultTTL: 86400
            ParametersInCacheKeyAndForwardedToOrigin:
                CookiesConfig:
                    CookieBehavior: none
                HeadersConfig:
                    HeaderBehavior: whitelist
                    Headers:
                        - Range # Critical for cloud-optimized access
                        - Origin
                QueryStringsConfig:
                    QueryStringBehavior: none
```

### Azure Blob Storage Configuration

#### CORS Configuration

```bash
az storage cors add \
    --services b \
    --methods GET HEAD OPTIONS \
    --origins '*' \
    --allowed-headers '*' \
    --exposed-headers 'Content-Length,Content-Range,Accept-Ranges' \
    --max-age 3600 \
    --account-name yourstorageaccount
```

#### Azure CDN Profile

```bash
# Create CDN profile
az cdn profile create \
    --name yourcdnprofile \
    --resource-group yourresourcegroup \
    --sku Standard_Microsoft

# Create endpoint
az cdn endpoint create \
    --name yourendpoint \
    --profile-name yourcdnprofile \
    --resource-group yourresourcegroup \
    --origin yourstorageaccount.blob.core.windows.net \
    --origin-host-header yourstorageaccount.blob.core.windows.net
```

### Self-Hosted: Nginx Configuration

```nginx
server {
    listen 443 ssl http2;
    server_name data.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    root /var/www/geodata;

    # Enable range requests
    location ~ \.(parquet|fgb|tif|tiff|copc\.laz|zarr)$ {
        # CORS headers
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, HEAD, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Range' always;
        add_header 'Access-Control-Expose-Headers' 'Content-Length, Content-Range, Accept-Ranges' always;

        # Handle preflight
        if ($request_method = 'OPTIONS') {
            add_header 'Access-Control-Allow-Origin' '*';
            add_header 'Access-Control-Allow-Methods' 'GET, HEAD, OPTIONS';
            add_header 'Access-Control-Allow-Headers' 'Range';
            add_header 'Access-Control-Max-Age' 3600;
            add_header 'Content-Length' 0;
            return 204;
        }

        # Advertise range support
        add_header 'Accept-Ranges' 'bytes' always;

        # Enable sendfile for efficient static file serving
        sendfile on;
        tcp_nopush on;
        tcp_nodelay on;

        # Cache control
        expires 1d;
        add_header Cache-Control "public, immutable";
    }
}
```

### Validation Script

```bash
#!/bin/bash
# validate-cloud-native.sh
# Test if a URL supports cloud-native access patterns

URL=$1

echo "Testing: $URL"
echo "================================"

# Test 1: HEAD request
echo -n "HEAD request... "
HEAD_RESPONSE=$(curl -sI "$URL" | head -20)
if echo "$HEAD_RESPONSE" | grep -qi "accept-ranges: bytes"; then
    echo "✓ Accept-Ranges: bytes"
else
    echo "✗ No Accept-Ranges header"
fi

# Test 2: Range request
echo -n "Range request... "
RANGE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Range: bytes=0-100" "$URL")
if [ "$RANGE_STATUS" = "206" ]; then
    echo "✓ Returns 206 Partial Content"
else
    echo "✗ Returns $RANGE_STATUS (expected 206)"
fi

# Test 3: CORS preflight
echo -n "CORS preflight... "
OPTIONS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS \
    -H "Origin: http://example.com" \
    -H "Access-Control-Request-Method: GET" \
    -H "Access-Control-Request-Headers: Range" \
    "$URL")
if [ "$OPTIONS_STATUS" = "200" ] || [ "$OPTIONS_STATUS" = "204" ]; then
    echo "✓ OPTIONS returns $OPTIONS_STATUS"
else
    echo "✗ OPTIONS returns $OPTIONS_STATUS"
fi

# Test 4: CORS headers on GET
echo -n "CORS headers... "
CORS_HEADERS=$(curl -sI -H "Origin: http://example.com" "$URL" | grep -i "access-control")
if [ -n "$CORS_HEADERS" ]; then
    echo "✓ CORS headers present"
else
    echo "✗ No CORS headers"
fi

echo "================================"
```

---

## Complete Working Examples

These examples use real, publicly available data that you can run immediately.

### Example 1: Query Overture Maps Buildings

```python
"""
Query Overture Maps buildings in a city center.
Run this to verify your setup works.
"""
import duckdb
import geopandas as gpd

def get_buildings_in_bbox(
    minx: float, miny: float, maxx: float, maxy: float,
    min_height: float = None
) -> gpd.GeoDataFrame:
    """
    Query Overture Maps buildings within a bounding box.

    Example:
        # Get tall buildings in Manhattan
        gdf = get_buildings_in_bbox(-74.01, 40.75, -73.97, 40.77, min_height=50)
    """
    con = duckdb.connect()

    # Install and load extensions
    con.execute("INSTALL spatial; INSTALL httpfs;")
    con.execute("LOAD spatial; LOAD httpfs;")
    con.execute("SET s3_region = 'us-west-2';")

    # Build query
    height_filter = f"AND height >= {min_height}" if min_height else ""

    query = f"""
    SELECT
        id,
        names.primary as name,
        height,
        num_floors,
        class,
        ST_AsWKB(geometry) as geometry
    FROM read_parquet(
        's3://overturemaps-us-west-2/release/2025-01-22.0/theme=buildings/type=building/*'
    )
    WHERE bbox.xmin <= {maxx}
      AND bbox.xmax >= {minx}
      AND bbox.ymin <= {maxy}
      AND bbox.ymax >= {miny}
      {height_filter}
    LIMIT 10000
    """

    print(f"Executing query for bbox: [{minx}, {miny}, {maxx}, {maxy}]")
    df = con.execute(query).fetchdf()
    print(f"Retrieved {len(df)} buildings")

    # Convert to GeoDataFrame
    if len(df) > 0:
        gdf = gpd.GeoDataFrame(
            df.drop(columns=['geometry']),
            geometry=gpd.GeoSeries.from_wkb(df['geometry']),
            crs="EPSG:4326"
        )
        return gdf
    else:
        return gpd.GeoDataFrame()


if __name__ == "__main__":
    # Manhattan example
    gdf = get_buildings_in_bbox(
        minx=-74.01, miny=40.75,
        maxx=-73.97, maxy=40.77,
        min_height=50
    )

    print("\nTall buildings in Manhattan:")
    print(gdf[['name', 'height', 'num_floors']].head(10))

    # Save to file
    gdf.to_file("manhattan_buildings.geojson", driver="GeoJSON")
    print("\nSaved to manhattan_buildings.geojson")
```

### Example 2: Read COG from NAIP Imagery

```python
"""
Read Cloud-Optimized GeoTIFF from NAIP public imagery.
Demonstrates efficient partial reads from large raster files.
"""
import rasterio
from rasterio.session import AWSSession
from rasterio.windows import from_bounds
import matplotlib.pyplot as plt
import numpy as np

def read_naip_window(
    bounds: tuple,  # (minx, miny, maxx, maxy) in EPSG:4326
    state: str = "ny",
    year: int = 2019
) -> tuple:
    """
    Read a window from NAIP imagery.

    NAIP provides high-resolution aerial imagery for the continental US.
    Data is stored as COGs on AWS Open Data.

    Returns:
        Tuple of (numpy array, profile dict)
    """
    # NAIP COG URL pattern
    # Note: You need to know the specific tile ID
    # This example uses a known tile in New York
    url = f"s3://naip-visualization/{state}/{year}/60cm/rgb/42074/m_4207459_ne_18_060_20190830.tif"

    # Configure rasterio for S3 access
    env = rasterio.Env(
        AWS_NO_SIGN_REQUEST='YES',
        GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',
        CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif',
    )

    with env:
        with rasterio.open(url) as src:
            print(f"Full image size: {src.width} x {src.height}")
            print(f"Bounds: {src.bounds}")
            print(f"CRS: {src.crs}")
            print(f"Block shapes: {src.block_shapes}")
            print(f"Overviews: {src.overviews(1)}")

            # Calculate window from geographic bounds
            minx, miny, maxx, maxy = bounds
            window = from_bounds(minx, miny, maxx, maxy, src.transform)

            print(f"\nReading window: {window}")
            print(f"Window size: {int(window.width)} x {int(window.height)} pixels")

            # Read the window (this triggers HTTP range requests)
            data = src.read(window=window)

            # Get the transform for the window
            window_transform = src.window_transform(window)

            profile = {
                'crs': src.crs,
                'transform': window_transform,
                'width': int(window.width),
                'height': int(window.height),
                'count': src.count,
                'dtype': src.dtypes[0]
            }

            return data, profile


def plot_naip(data: np.ndarray, title: str = "NAIP Imagery"):
    """Plot RGB NAIP imagery."""
    # NAIP is RGB (3 bands)
    # Transpose from (bands, height, width) to (height, width, bands)
    rgb = np.transpose(data[:3], (1, 2, 0))

    plt.figure(figsize=(10, 10))
    plt.imshow(rgb)
    plt.title(title)
    plt.axis('off')
    plt.tight_layout()
    plt.savefig('naip_sample.png', dpi=150)
    print("Saved to naip_sample.png")
    plt.show()


if __name__ == "__main__":
    # Read a small area (adjust coordinates for the specific tile)
    # These coordinates are within the m_4207459_ne_18_060_20190830 tile
    bounds = (-73.985, 40.758, -73.980, 40.762)  # Small area in NYC

    try:
        data, profile = read_naip_window(bounds)
        print(f"\nRead array shape: {data.shape}")
        plot_naip(data, "NAIP NYC Sample")
    except Exception as e:
        print(f"Error: {e}")
        print("\nNote: NAIP tiles have specific coverage areas.")
        print("Adjust the bounds to match the tile's extent.")
```

### Example 3: FlatGeobuf in Browser (HTML)

```html
<!DOCTYPE html>
<html>
    <head>
        <title>FlatGeobuf Cloud-Native Example</title>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <style>
            #map {
                height: 100vh;
                width: 100%;
            }
            #status {
                position: absolute;
                top: 10px;
                right: 10px;
                background: white;
                padding: 10px;
                border-radius: 4px;
                z-index: 1000;
                font-family: monospace;
            }
        </style>
    </head>
    <body>
        <div id="map"></div>
        <div id="status">Loading...</div>

        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <script src="https://unpkg.com/flatgeobuf@3.30.0/dist/flatgeobuf-geojson.min.js"></script>

        <script>
            // Initialize map
            const map = L.map("map").setView([52.52, 13.405], 14); // Berlin

            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                attribution: "© OpenStreetMap contributors"
            }).addTo(map);

            // FlatGeobuf file URL (using a public example)
            // Replace with your own FlatGeobuf file URL
            const FGB_URL = "https://flatgeobuf.org/test/data/countries.fgb";

            let currentLayer = null;

            async function loadFeatures() {
                const status = document.getElementById("status");
                const bounds = map.getBounds();

                // Create bounding box
                const bbox = {
                    minX: bounds.getWest(),
                    minY: bounds.getSouth(),
                    maxX: bounds.getEast(),
                    maxY: bounds.getNorth()
                };

                status.textContent = "Fetching features...";

                // Remove previous layer
                if (currentLayer) {
                    map.removeLayer(currentLayer);
                }

                // Create new layer
                currentLayer = L.geoJSON(null, {
                    style: {
                        color: "#3388ff",
                        weight: 2,
                        fillOpacity: 0.1
                    },
                    onEachFeature: (feature, layer) => {
                        if (feature.properties.name) {
                            layer.bindPopup(feature.properties.name);
                        }
                    }
                }).addTo(map);

                let count = 0;
                const startTime = Date.now();

                try {
                    // Stream features from FlatGeobuf
                    // This uses HTTP Range requests under the hood
                    const iter = flatgeobuf.geojson.deserialize(FGB_URL, bbox);

                    for await (const feature of iter) {
                        currentLayer.addData(feature);
                        count++;

                        if (count % 10 === 0) {
                            status.textContent = `Loaded ${count} features...`;
                        }
                    }

                    const elapsed = Date.now() - startTime;
                    status.textContent = `Loaded ${count} features in ${elapsed}ms`;
                } catch (error) {
                    status.textContent = `Error: ${error.message}`;
                    console.error(error);
                }
            }

            // Load on map move
            map.on("moveend", loadFeatures);

            // Initial load
            loadFeatures();
        </script>
    </body>
</html>
```

### Example 4: PMTiles with MapLibre

```html
<!DOCTYPE html>
<html>
    <head>
        <title>PMTiles Cloud-Native Example</title>
        <script src="https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.js"></script>
        <link href="https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.css" rel="stylesheet" />
        <script src="https://unpkg.com/pmtiles@3.0.3/dist/pmtiles.js"></script>
        <style>
            body {
                margin: 0;
                padding: 0;
            }
            #map {
                position: absolute;
                top: 0;
                bottom: 0;
                width: 100%;
            }
        </style>
    </head>
    <body>
        <div id="map"></div>

        <script>
            // Register PMTiles protocol with MapLibre
            const protocol = new pmtiles.Protocol();
            maplibregl.addProtocol("pmtiles", protocol.tile);

            // PMTiles file URL (public example from Protomaps)
            const PMTILES_URL =
                "https://protomaps.github.io/PMTiles/protomaps(vector)ODbL_firenze.pmtiles";

            const map = new maplibregl.Map({
                container: "map",
                style: {
                    version: 8,
                    sources: {
                        "pmtiles-source": {
                            type: "vector",
                            url: `pmtiles://${PMTILES_URL}`
                        }
                    },
                    layers: [
                        {
                            id: "background",
                            type: "background",
                            paint: { "background-color": "#f8f4f0" }
                        },
                        {
                            id: "water",
                            type: "fill",
                            source: "pmtiles-source",
                            "source-layer": "water",
                            paint: { "fill-color": "#a0c8f0" }
                        },
                        {
                            id: "landuse",
                            type: "fill",
                            source: "pmtiles-source",
                            "source-layer": "landuse",
                            paint: {
                                "fill-color": [
                                    "match",
                                    ["get", "landuse"],
                                    "residential",
                                    "#e8e0d8",
                                    "commercial",
                                    "#f0e8d8",
                                    "industrial",
                                    "#e0d8d0",
                                    "park",
                                    "#c8e0c0",
                                    "#f0f0f0"
                                ],
                                "fill-opacity": 0.5
                            }
                        },
                        {
                            id: "roads",
                            type: "line",
                            source: "pmtiles-source",
                            "source-layer": "transportation",
                            paint: {
                                "line-color": "#ffffff",
                                "line-width": [
                                    "interpolate",
                                    ["linear"],
                                    ["zoom"],
                                    10,
                                    0.5,
                                    14,
                                    2,
                                    18,
                                    8
                                ]
                            }
                        },
                        {
                            id: "buildings",
                            type: "fill",
                            source: "pmtiles-source",
                            "source-layer": "building",
                            paint: {
                                "fill-color": "#d8d0c8",
                                "fill-opacity": 0.8
                            }
                        }
                    ]
                },
                center: [11.25, 43.77], // Florence, Italy
                zoom: 14
            });

            map.addControl(new maplibregl.NavigationControl());

            // Log tile requests to see range requests in action
            map.on("data", (e) => {
                if (e.dataType === "source" && e.sourceId === "pmtiles-source") {
                    console.log("PMTiles data loaded:", e);
                }
            });
        </script>
    </body>
</html>
```

### Example 5: Zarr with Xarray

```python
"""
Read cloud-optimized Zarr data from a public source.
Demonstrates efficient access to multidimensional array data.
"""
import xarray as xr
import matplotlib.pyplot as plt
import numpy as np

def read_zarr_example():
    """
    Read ERA5 climate data from Google Cloud.
    This is a well-known public Zarr dataset.
    """
    # Google Cloud public Zarr store
    # ERA5 reanalysis data
    url = "gs://gcp-public-data-arco-era5/ar/full_37-1h-0p25deg-chunk-1.zarr-v3"

    print(f"Opening Zarr store: {url}")

    # Open with xarray - this reads only metadata initially
    ds = xr.open_zarr(
        url,
        chunks='auto',
        consolidated=True
    )

    print("\nDataset overview:")
    print(ds)

    print("\nVariables:")
    for var in ds.data_vars:
        print(f"  {var}: {ds[var].dims} - {ds[var].shape}")

    # Select a small subset - this triggers actual data fetching
    # Temperature at 2m for one time step
    print("\nFetching temperature subset...")

    temp = ds['2m_temperature'].isel(
        time=0,  # First time step
    ).sel(
        latitude=slice(60, 30),   # Europe latitude range
        longitude=slice(-20, 40)  # Europe longitude range
    )

    # Load the actual data (triggers HTTP requests)
    print(f"Loading {temp.nbytes / 1e6:.1f} MB...")
    temp_data = temp.load()

    # Plot
    plt.figure(figsize=(12, 8))
    temp_data.plot(cmap='RdYlBu_r')
    plt.title('ERA5 2m Temperature - Europe')
    plt.savefig('zarr_temperature.png', dpi=150)
    print("Saved to zarr_temperature.png")

    return ds


def read_pangeo_example():
    """
    Read ocean data from Pangeo catalog.
    Another public Zarr data source.
    """
    # CMIP6 climate model output
    url = "https://ncsa.osn.xsede.org/Pangeo/pangeo-forge/gpcp-feedstock/gpcp.zarr"

    print(f"Opening: {url}")

    ds = xr.open_zarr(url, consolidated=True)

    print("\nGPCP Precipitation dataset:")
    print(ds)

    # Get precipitation for a specific time range
    precip = ds['precip'].sel(time='2020-01').mean(dim='time')

    print(f"\nLoading monthly mean precipitation...")
    precip_data = precip.load()

    plt.figure(figsize=(14, 6))
    precip_data.plot(cmap='Blues', vmin=0, vmax=20)
    plt.title('GPCP Precipitation - January 2020 Mean (mm/day)')
    plt.savefig('zarr_precipitation.png', dpi=150)
    print("Saved to zarr_precipitation.png")

    return ds


if __name__ == "__main__":
    print("=" * 60)
    print("Example 1: ERA5 Climate Reanalysis from Google Cloud")
    print("=" * 60)

    try:
        ds1 = read_zarr_example()
    except Exception as e:
        print(f"ERA5 example failed: {e}")
        print("This may require gcsfs: pip install gcsfs")

    print("\n" + "=" * 60)
    print("Example 2: GPCP Precipitation from Pangeo")
    print("=" * 60)

    try:
        ds2 = read_pangeo_example()
    except Exception as e:
        print(f"Pangeo example failed: {e}")
```

### Example 6: Complete Application - Geospatial Data Explorer

```python
"""
Complete application demonstrating multiple cloud-native formats.
A simple CLI tool to explore geospatial data from various sources.
"""
import click
import geopandas as gpd
import duckdb
from pathlib import Path
import json


@click.group()
def cli():
    """Cloud-Native Geospatial Data Explorer"""
    pass


@cli.command()
@click.argument('minx', type=float)
@click.argument('miny', type=float)
@click.argument('maxx', type=float)
@click.argument('maxy', type=float)
@click.option('--theme', default='places',
              type=click.Choice(['places', 'buildings', 'addresses', 'transportation']))
@click.option('--output', '-o', default='output.geojson')
@click.option('--limit', default=1000)
def overture(minx, miny, maxx, maxy, theme, output, limit):
    """Query Overture Maps data within a bounding box."""
    click.echo(f"Querying Overture {theme} in bbox: [{minx}, {miny}, {maxx}, {maxy}]")

    con = duckdb.connect()
    con.execute("INSTALL spatial; INSTALL httpfs; LOAD spatial; LOAD httpfs;")
    con.execute("SET s3_region = 'us-west-2';")

    type_map = {
        'places': 'place',
        'buildings': 'building',
        'addresses': 'address',
        'transportation': 'segment'
    }

    feature_type = type_map[theme]

    query = f"""
    SELECT
        id,
        names.primary as name,
        ST_AsWKB(geometry) as geometry
    FROM read_parquet(
        's3://overturemaps-us-west-2/release/2025-01-22.0/theme={theme}/type={feature_type}/*'
    )
    WHERE bbox.xmin <= {maxx}
      AND bbox.xmax >= {minx}
      AND bbox.ymin <= {maxy}
      AND bbox.ymax >= {miny}
    LIMIT {limit}
    """

    df = con.execute(query).fetchdf()
    click.echo(f"Retrieved {len(df)} features")

    if len(df) > 0:
        gdf = gpd.GeoDataFrame(
            df.drop(columns=['geometry']),
            geometry=gpd.GeoSeries.from_wkb(df['geometry']),
            crs="EPSG:4326"
        )
        gdf.to_file(output, driver='GeoJSON')
        click.echo(f"Saved to {output}")


@cli.command()
@click.argument('url')
@click.option('--bbox', nargs=4, type=float, help='minx miny maxx maxy')
@click.option('--output', '-o', default='output.geojson')
def geoparquet(url, bbox, output):
    """Read GeoParquet file with optional bbox filter."""
    click.echo(f"Reading GeoParquet: {url}")

    gdf = gpd.read_parquet(url)
    click.echo(f"Total features: {len(gdf)}")

    if bbox:
        minx, miny, maxx, maxy = bbox
        gdf = gdf.cx[minx:maxx, miny:maxy]
        click.echo(f"Features in bbox: {len(gdf)}")

    gdf.to_file(output, driver='GeoJSON')
    click.echo(f"Saved to {output}")


@cli.command()
@click.argument('url')
def validate(url):
    """Validate that a URL supports cloud-native access."""
    import httpx

    click.echo(f"Validating: {url}")

    checks = []

    with httpx.Client() as client:
        # Check HEAD
        try:
            head = client.head(url)
            checks.append(('HEAD request', head.status_code == 200))

            accept_ranges = head.headers.get('accept-ranges', '')
            checks.append(('Accept-Ranges: bytes', accept_ranges == 'bytes'))

            content_length = head.headers.get('content-length')
            if content_length:
                checks.append(('Content-Length header', True))
                click.echo(f"  File size: {int(content_length):,} bytes")
        except Exception as e:
            checks.append(('HEAD request', False))
            click.echo(f"  Error: {e}")

        # Check range request
        try:
            resp = client.get(url, headers={'Range': 'bytes=0-100'})
            checks.append(('Range request (206)', resp.status_code == 206))
        except Exception as e:
            checks.append(('Range request', False))

        # Check CORS
        try:
            resp = client.options(url, headers={
                'Origin': 'http://example.com',
                'Access-Control-Request-Method': 'GET'
            })
            has_cors = 'access-control-allow-origin' in resp.headers
            checks.append(('CORS headers', has_cors))
        except:
            checks.append(('CORS headers', False))

    click.echo("\nResults:")
    for check, passed in checks:
        status = click.style('✓', fg='green') if passed else click.style('✗', fg='red')
        click.echo(f"  {status} {check}")

    all_passed = all(passed for _, passed in checks)
    if all_passed:
        click.echo(click.style("\nURL is cloud-native ready!", fg='green'))
    else:
        click.echo(click.style("\nSome checks failed. See above.", fg='yellow'))


if __name__ == '__main__':
    cli()
```

**Usage:**

```bash
# Query Overture places
python explorer.py overture -74.01 40.75 -73.97 40.77 --theme places -o nyc_places.geojson

# Read GeoParquet with bbox
python explorer.py geoparquet https://example.com/data.parquet --bbox -74 40 -73 41

# Validate URL
python explorer.py validate https://example.com/data.parquet
```

---

## Resources

### Format Specifications

- **COG**: https://www.cogeo.org/
- **Zarr**: https://zarr.dev/
- **COPC**: https://copc.io/
- **GeoParquet**: https://geoparquet.org/
- **FlatGeobuf**: https://flatgeobuf.org/
- **PMTiles**: https://github.com/protomaps/PMTiles
- **STAC**: https://stacspec.org/

### Overture Maps

- **Documentation**: https://docs.overturemaps.org/
- **Main Website**: https://overturemaps.org/
- **Schema Repository**: https://github.com/OvertureMaps/schema
- **Data Repository**: https://github.com/OvertureMaps/data
- **Explorer**: https://explore.overturemaps.org/

### Tools

- **DuckDB**: https://duckdb.org/
- **GDAL**: https://gdal.org/
- **GeoPandas**: https://geopandas.org/
- **Rasterio**: https://rasterio.readthedocs.io/
- **PDAL**: https://pdal.io/

---

_This documentation was compiled from the Cloud-Native Geospatial Forum's guide at guide.cloudnativegeo.org and Overture Maps documentation at docs.overturemaps.org_
