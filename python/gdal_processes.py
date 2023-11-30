from osgeo import gdal, osr, gdal_array, gdalconst
import numpy as np
import sys
import subprocess
import os


def save_tiff_image(rgb_image, output_path):
    if rgb_image is None:
        print("Data not available for the specified parameter number.")
        return

    if rgb_image.ndim == 2:
        rgb_image = np.expand_dims(rgb_image, axis=-1)
    if rgb_image.shape[2] == 1:
        # If the third dimension has size 1, replicate it to create 3 channels
        rgb_image = np.repeat(rgb_image, 3, axis=2)
    rows, cols, _ = rgb_image.shape

    # Create a GeoTIFF driver
    driver = gdal.GetDriverByName('GTiff')

    # Create a new GeoTIFF file
    dataset = driver.Create(output_path, cols, rows, 3, gdal.GDT_Byte)

    # Define the spatial reference system
    srs = osr.SpatialReference()
    srs.ImportFromEPSG(4326)  # Use WGS 84
    dataset.SetProjection(srs.ExportToWkt())

    # Define the geotransform (upper-left corner, pixel size, rotation)
    geotransform = (-180, round(360/cols, 2), 0, 90, 0, round(-180/rows, 2))  # Adjust if needed
    dataset.SetGeoTransform(geotransform)

    # Write RGB bands to the GeoTIFF file
    # Write the second half of the image (from the start to the middle)
    for i in range(3):
        band = dataset.GetRasterBand(i + 1)
        band.WriteArray(rgb_image[:, :cols // 2, i], xoff=cols // 2)

    # Write the first half of the image (from the middle to the end)
    for i in range(3):
        band = dataset.GetRasterBand(i + 1)
        band.WriteArray(rgb_image[:, cols // 2:, i])

    # Close the dataset to flush to disk
    dataset = None


def create_tiles(input_tif, output_folder, zoom_levels="0-3"):
    output_tif = './tif/tif_new.tif'
    try:
        os.remove(output_tif)
        print(f'Файл {output_tif} успешно удален.')
    except OSError as e:
        print(f"Ошибка при удалении файла {output_tif}: {e}")
    subprocess.call(['gdalwarp', '-tr', '0.125', '0.125', '-r', 'bilinear', input_tif, output_tif])
    gdal2tiles = 'C:/Users/golov/anaconda3/Lib/site-packages/GDAL-3.6.2-py3.11-win-amd64.egg-info/scripts/gdal2tiles.py'
    command = [
        'python',
        gdal2tiles,
        '-z', zoom_levels,
        '-r', 'bilinear',
        '-w', 'none',
        output_tif,
        output_folder
    ]

    subprocess.run(command, check=True)
    try:
        os.remove(input_tif)
        print(f'Файл {input_tif} успешно удален.')
    except OSError as e:
        print(f"Ошибка при удалении файла {input_tif}: {e}")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Usage: python gdal_processes.py <temp_rgb_file> <output_tiff_path> <tiles_folder>")
        sys.exit(1)

    temp_rgb_file = sys.argv[1]
    output_tiff_path = sys.argv[2]
    tiles_folder = sys.argv[3]

    rgb_image = np.load(temp_rgb_file)
    print("Loaded rgb_image shape:", rgb_image.shape)
    save_tiff_image(rgb_image, output_tiff_path)
    create_tiles(output_tiff_path, tiles_folder)
