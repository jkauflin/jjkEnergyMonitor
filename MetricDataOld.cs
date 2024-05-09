
namespace App.WindowsService
{
    public class MetricDataOld
    {
        /*
        2023-02-04 10:01:39.92 >>> logMetric, {
        "pvVolts":"121.89","pvAmps":"3.08","pvWatts":"364.95",
        "weather":801,"weatherTemp":22.35,"weatherFeels":9.75,
        "weatherPressure":1030,"weatherHumidity":62,"weatherDateTime":1 675 522 351}
        */
        public string pvVolts { get; set; }
        public string pvAmps { get; set; }
        public string pvWatts { get; set; }
        /*
        public int weather { get; set; }
        public float weatherTemp { get; set; }
        public float weatherFeels { get; set; }
        public int weatherPressure { get; set; }
        public int weatherHumidity{ get; set; }
        public int weatherDateTime{ get; set; }
        */
    }
}
