import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../utils/supabase';
import Icon3D from '../../components/Icon3D';
import { useAuth } from '../../context/AuthContext';
import { useFocusEffect } from '@react-navigation/native';

export default function EmployeeDashboardScreen() {
    const { user } = useAuth();
    const [activeRecord, setActiveRecord] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [stats, setStats] = useState({ overtime: 0, live: '00:00' });

    const fetchStatus = async () => {
        if (!user) return;
        try {
            // Get today's record
            const today = new Date().toISOString().split('T')[0];
            const { data, error } = await supabase
                .from('attendance_records')
                .select('*')
                .eq('user_id', user.id)
                .eq('date', today)
                .maybeSingle();

            if (!error && data) {
                setActiveRecord(data);
            } else {
                setActiveRecord(null);
            }
        } catch (e) {
            console.log(e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetchStatus();
        }, [user])
    );

    const onRefresh = React.useCallback(() => {
        setRefreshing(true);
        fetchStatus();
    }, []);

    const handleCheckAction = async () => {
        if (!user) return;
        setLoading(true);

        try {
            const today = new Date().toISOString().split('T')[0];
            const nowIso = new Date().toISOString();

            if (activeRecord && !activeRecord.check_out) {
                // Check Out
                const { error } = await supabase
                    .from('attendance_records')
                    .update({
                        check_out: nowIso,
                        status: 'Present' // Simple status update
                    })
                    .eq('id', activeRecord.id);

                if (error) throw error;
                Alert.alert("Success", "Checked out successfully!");
            } else {
                // Check In
                if (activeRecord?.check_out) {
                    Alert.alert("Notice", "You have already checked out for today.");
                    return;
                }

                const newRecord = {
                    user_id: user.id,
                    user_name: user.name,
                    date: today,
                    check_in: nowIso,
                    status: 'Present'
                };

                const { error } = await supabase
                    .from('attendance_records')
                    .insert([newRecord]);

                if (error) throw error;
                Alert.alert("Success", "Checked in successfully!");
            }
            fetchStatus();
        } catch (err: any) {
            Alert.alert("Error", err.message || "Failed to update attendance");
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-white">
            <ScrollView
                contentContainerStyle={{ paddingBottom: 100 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
                <View className="px-6 py-6 space-y-6">

                    {/* Header */}
                    <View className="flex-row items-center gap-4">
                        <Icon3D icon="LayoutDashboard" size="md" variant="blue" />
                        <View>
                            <Text className="text-sm font-bold text-slate-500">Welcome Back</Text>
                            <Text className="text-2xl font-black text-slate-900">{user?.name || 'Employee'}</Text>
                        </View>
                    </View>

                    {/* Action Card */}
                    <View className="bg-white rounded-[2.5rem] p-2 border-2 border-slate-100 shadow-xl shadow-blue-500/10">
                        <View className="bg-slate-50 rounded-[2rem] p-8 items-center justify-center space-y-6">
                            <View className={`w-4 h-4 rounded-full animate-pulse ${activeRecord && !activeRecord.check_out ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                            <Text className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">
                                {activeRecord && !activeRecord.check_out ? 'Currently Active' : 'Not Checked In'}
                            </Text>

                            <TouchableOpacity
                                onPress={handleCheckAction}
                                disabled={loading}
                                className={`w-48 h-48 rounded-full items-center justify-center shadow-2xl elevation-10 
                                    ${activeRecord && !activeRecord.check_out ? 'bg-rose-500 shadow-rose-500/30' : 'bg-blue-600 shadow-blue-500/30'}
                                    ${loading ? 'opacity-50' : 'opacity-100'}
                                `}
                            >
                                <View className="w-40 h-40 rounded-full border-4 border-white/20 items-center justify-center">
                                    <Text className="text-white font-black text-xl uppercase tracking-widest text-center">
                                        {loading ? '...' : (activeRecord && !activeRecord.check_out ? 'Check\nOut' : 'Check\nIn')}
                                    </Text>
                                </View>
                            </TouchableOpacity>

                            <Text className="text-xs font-bold text-slate-400">Tap to record attendance</Text>
                        </View>
                    </View>

                    {/* Stats Grid */}
                    <View className="flex-row gap-4">
                        <View className="flex-1 bg-blue-50/50 p-5 rounded-[2rem] border border-blue-100 relative overflow-hidden">
                            <Icon3D icon="Activity" size="xs" variant="blue" className="mb-3" />
                            <Text className="text-[10px] font-black uppercase tracking-widest text-blue-400">Overtime</Text>
                            <Text className="text-xl font-black text-blue-600 mt-1">0h 0m</Text>
                        </View>
                        <View className="flex-1 bg-emerald-50/50 p-5 rounded-[2rem] border border-emerald-100 relative overflow-hidden">
                            <Icon3D icon="Timer" size="xs" variant="emerald" className="mb-3" />
                            <Text className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Live</Text>
                            <Text className="text-xl font-black text-emerald-600 mt-1">--:--</Text>
                        </View>
                    </View>

                    {/* Late Allowance */}
                    <View className="bg-amber-50/50 p-6 rounded-[2rem] border border-amber-100">
                        <View className="flex-row items-center justify-between mb-4">
                            <View className="flex-row items-center gap-3">
                                <Icon3D icon="History" size="xs" variant="amber" />
                                <Text className="text-[10px] font-black uppercase tracking-widest text-amber-500">Late Allowance</Text>
                            </View>
                            <Text className="font-black text-amber-600">3 left</Text>
                        </View>
                        <View className="h-2 bg-amber-100 rounded-full overflow-hidden">
                            <View className="h-full bg-amber-500 w-[70%]" />
                        </View>
                    </View>

                </View>
            </ScrollView>
        </SafeAreaView>
    );
}
