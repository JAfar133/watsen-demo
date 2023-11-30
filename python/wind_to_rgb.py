import random

import eccodes
import numpy as np
import subprocess
import tempfile
import os

def read_grib_data(file_path):
    """
    Read data from a GRIB2 file for the specified parameter.
    """
    with open(file_path, 'rb') as file:
        codes = eccodes.codes_grib_new_from_file(file)
        # Read the values from the message
        ni = eccodes.codes_get(codes, 'Ni')
        nj = eccodes.codes_get(codes, 'Nj')
        data = eccodes.codes_get_values(codes)
        eccodes.codes_release(codes)
        return data, ni, nj


def read_wind_data(file_path, parameter_number):
    """
    Read data from a GRIB2 file for the specified parameter.
    """
    with open(file_path, 'rb') as file:
        codes = eccodes.codes_grib_new_from_file(file)

        while codes is not None:
            # Get the parameter number from the current message
            current_parameter_number = eccodes.codes_get(codes, 'parameterNumber')
            if current_parameter_number == parameter_number:
                # Read the values from the message
                ni = eccodes.codes_get(codes, 'Ni')
                nj = eccodes.codes_get(codes, 'Nj')
                data = eccodes.codes_get_values(codes)
                eccodes.codes_release(codes)
                return data, ni, nj

            # Move to the next message in the file
            eccodes.codes_release(codes)
            codes = eccodes.codes_grib_new_from_file(file)

    return None


def read_precipitation_data(file_path):
    """
    Read data from a GRIB2 file for the specified parameter.
    """
    with open(file_path, 'rb') as file:
        codes = eccodes.codes_grib_new_from_file(file)
        message_count = 0  # Счетчик сообщений

        while codes is not None:
            message_count += 1

            if message_count == 2:
                ni = eccodes.codes_get(codes, 'Ni')
                nj = eccodes.codes_get(codes, 'Nj')
                data = eccodes.codes_get_values(codes)
                eccodes.codes_release(codes)
                return data, ni, nj

            eccodes.codes_release(codes)
            codes = eccodes.codes_grib_new_from_file(file)

    return None


def encode_data_to_rgb(data, ni, nj, data_name):
    if data is None:
        return None

    if data_name == 'TMP':
        red_channel = np.clip((data - 200) / (320 - 200), 0, 1) * 255
        green_channel = np.where(data < 273, random.randint(50, 60), random.randint(70, 80))
        blue_channel = np.clip(data / 273, 0, 1) * 255
        print(np.average(data), np.min(data), np.max(data))

    elif data_name == 'APCP':
        red_channel = np.clip(data / 500, 0, 1) * 255
        green_channel = np.clip(data / 6, 0, 1) * 255
        blue_channel = np.clip(data / 8, 0, 1) * 255
        print(np.average(data), np.min(data), np.max(data))

    elif data_name == 'RH':
        red_channel = np.clip(data / 100, 0, 1) * 255
        green_channel = np.clip(data / 6, 0, 1) * 255
        blue_channel = np.clip(data / 50, 0, 1) * 255
        print(np.average(data), np.min(data), np.max(data))

    elif data_name == 'PRES':
        red_channel = np.clip((data - 90000) / (105000 - 90000), 0, 1) * 255
        green_channel = np.clip(data / 90000, 0, 1) * 255
        blue_channel = np.clip(data / 95000, 0, 1) * 255
        print(np.average(data), np.min(data), np.max(data))
    else:
        return None

    rgb_image = np.stack([red_channel, green_channel, blue_channel], axis=-1)
    rgb_image = rgb_image.reshape(nj, ni, 3)
    return rgb_image


def encode_wind_to_rgb(u_data, v_data, ni, nj):
    if u_data is None or v_data is None:
        return None

    wind_speed = np.sqrt(u_data ** 2 + v_data ** 2)
    wind_direction = np.arctan2(v_data, u_data)

    normalized_direction = np.clip(abs(wind_direction) / np.pi, 0, 1)
    normalized_speed = np.clip(wind_speed / 40.0, 0, 1)

    # Generate random values for the red channel
    red_channel = np.where(wind_direction < 0, random.randint(50, 60), random.randint(70, 80))

    # Broadcast the random values to the shape of the other channels
    red_channel = np.broadcast_to(red_channel, normalized_direction.shape)

    green_channel = normalized_direction * 255
    blue_channel = normalized_speed * 255

    rgb_image = np.stack([red_channel, green_channel, blue_channel], axis=-1)

    # Reshape the image
    rgb_image = rgb_image.reshape(nj, ni, 3)

    return rgb_image


if __name__ == "__main__":
    # hour = 66
    # grib2_file_path = f'C:/Users/golov/Downloads/gfs.t06z.pgrb2.0p25.f0{hour}'
    # output_tiff_path = './tif/wind.tif'
    # tiles_folder = f'C:/watsen-test/tiles/gfs/{hour + 6}h/wind'
    #
    # # Чтение данных о ветре из GRIB2 файла
    # u_data, ni, nj = read_wind_data(grib2_file_path, 2)
    # v_data, ni, nj = read_wind_data(grib2_file_path, 3)
    # rgb_image = encode_wind_to_rgb(u_data, v_data, ni, nj)
    for i in range(0, 73, 6):
        grib2_file_path = f'C:/gfs/grib_files/{i}h/gfs.PRES.f{i:03}.grib2'
        output_tiff_path = './tif/temp.tif'
        tiles_folder = f'C:/watsen-test/tiles/gfs/{i}h/sp'
        data, ni, nj = read_grib_data(grib2_file_path)
        rgb_image = encode_data_to_rgb(data, ni, nj, 'PRES')
        if rgb_image is not None:
            # Create a temporary file to store the rgb_image
            temp_rgb_file = tempfile.NamedTemporaryFile(suffix=".npy", delete=False).name
            np.save(temp_rgb_file, rgb_image)

            try:
                # Сохранение изображения в формате TIFF
                subprocess.call(['C:/Users/golov/anaconda3/python.exe', 'gdal_processes.py', temp_rgb_file, output_tiff_path, tiles_folder])
            finally:
                # Cleanup: Remove the temporary numpy file
                os.remove(temp_rgb_file)
        else:
            print("Data not available for the specified parameter number.")
